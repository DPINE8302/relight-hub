import AppKit
import Darwin
import Foundation

@MainActor final class Hardware: ObservableObject {
    @Published var access = "Not requested"
    @Published var devices: [[String: Any]] = []
    @Published var bindings: [[String: Any]] = []
    @Published var learning: String?
    @Published var message = "Connect your USB controls, then assign each purpose."
    @Published var tested = Set<String>()
    var onInput: ((String) -> Void)?
    var onDisconnect: (() -> Void)?
    private var process: Process?
    private var input: FileHandle?
    private var buffer = Data()
    private var lastPress: [String: Date] = [:]
    private var monitor: Timer?
    init() {
        signal(SIGPIPE, SIG_IGN)
        if let data = UserDefaults.standard.data(forKey: "native.hid.bindings"), let b = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] { bindings = b }
    }
    func start() {
        guard process == nil else { return }
        monitor?.invalidate(); buffer.removeAll()
        let helper = Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/relight-hid-bridge")
        guard FileManager.default.isExecutableFile(atPath: helper.path) else { message = "USB helper missing from this build"; return }
        let p = Process(), stdin = Pipe(), stdout = Pipe()
        p.executableURL = helper; p.arguments = ["--stdio"]; p.standardInput = stdin; p.standardOutput = stdout; p.standardError = Pipe()
        input = stdin.fileHandleForWriting
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            Task { @MainActor in self?.receive(data) }
        }
        p.terminationHandler = { [weak self] ended in Task { @MainActor in self?.access = "Unavailable"; self?.message = "USB helper stopped (\(ended.terminationStatus)). Reopen Devices to retry."; self?.process = nil; self?.input = nil; self?.onDisconnect?() } }
        do { try p.run(); process = p; send("assignments.set", ["bindings": bindings]); send("inventory.refresh") }
        catch { message = error.localizedDescription }
        monitor = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in Task { @MainActor in self?.refresh() } }
    }
    func send(_ name: String, _ payload: [String: Any] = [:]) {
        guard process?.isRunning == true else { return }
        var command = payload
        command["version"] = 1; command["kind"] = "command"; command["command"] = name; command["requestId"] = UUID().uuidString
        if let data = try? JSONSerialization.data(withJSONObject: command) {
            do { try input?.write(contentsOf: data + Data([10])) }
            catch { access = "Unavailable"; message = "USB helper connection closed. Retry from Devices." }
        }
    }
    func refresh() { send("inventory.refresh") }
    func requestAccess() { start(); send("access.request"); refresh() }
    func assign(_ role: String) {
        start(); send("foreground.set", ["active": true]); learning = role
        message = "Press and release the \(role == "RECORD_BUTTON" ? "Record" : "Continue / Decline") control twice."
        send("learn.start", ["role": role])
    }
    func cancel() { send("learn.cancel"); learning = nil; message = "Assignment cancelled" }
    func active(_ value: Bool) { send("foreground.set", ["active": value]) }
    func shutdown() { monitor?.invalidate(); send("shutdown"); process?.terminate(); process = nil }
    func connected(_ role: String) -> Bool {
        guard let binding = bindings.first(where: { $0["role"] as? String == role }), let id = binding["deviceId"] as? String else { return false }
        return devices.contains { $0["id"] as? String == id }
    }
    func label(_ role: String) -> String { bindings.first(where: { $0["role"] as? String == role })?["deviceLabel"] as? String ?? "Not assigned" }
    func receive(_ data: Data) {
        guard !data.isEmpty else { return }
        buffer.append(data)
        if buffer.count > 131072 { buffer.removeAll(); message = "USB helper response exceeded limit"; return }
        while let end = buffer.firstIndex(of: 10) {
            let line = buffer.prefix(upTo: end); buffer.removeSubrange(...end)
            guard let event = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
            let payload = event["payload"] as? [String: Any] ?? event
            do {
                if let devices = payload["devices"] as? [[String: Any]] {
                    let removedAssigned = bindings.contains { b in
                        let id = b["deviceId"] as? String
                        return self.devices.contains { $0["id"] as? String == id } && !devices.contains { $0["id"] as? String == id }
                    }
                    self.devices = devices
                    if removedAssigned { tested.removeAll(); onDisconnect?() }
                }
                if let status = payload["access"] as? String { access = status }
            }
            if let status = event["access"] as? String { access = status }
            switch event["event"] as? String {
            case "device.added": refresh()
            case "device.removed": tested.removeAll(); refresh(); onDisconnect?()
            case "learn.candidate":
                if let binding = event["binding"] as? [String: Any], let role = binding["role"] as? String {
                    let conflicts = bindings.contains { $0["role"] as? String != role && $0["deviceId"] as? String == binding["deviceId"] as? String && $0["elementId"] as? String == binding["elementId"] as? String }
                    if conflicts { message = "Choose a different control: this input already has another purpose."; learning = nil; break }
                    bindings.removeAll { $0["role"] as? String == role }; bindings.append(binding)
                    UserDefaults.standard.set(try? JSONSerialization.data(withJSONObject: bindings), forKey: "native.hid.bindings")
                    send("assignments.set", ["bindings": bindings]); tested.remove(role); learning = nil
                    message = "Assigned. Press the control once more to test it."
                }
            case "input.edge":
                if event["edge"] as? String == "down", let role = event["role"] as? String, Date().timeIntervalSince(lastPress[role] ?? .distantPast) > 0.25 {
                    lastPress[role] = Date(); tested.insert(role); message = "\(role == "RECORD_BUTTON" ? "Record" : "Continue / Decline") input received"; onInput?(role)
                }
            default: break
            }
            if let error = event["error"] as? [String: Any], let description = error["message"] as? String { message = description; learning = nil }
        }
    }
}
