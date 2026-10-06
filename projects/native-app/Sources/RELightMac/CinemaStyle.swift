import SwiftUI

// The audience's light field exists only at the consent gate, never over the film.
enum Cinema {
    static let canvas = Color(red: 0.055, green: 0.059, blue: 0.066)
    static let panel = Color(red: 0.087, green: 0.092, blue: 0.10)
    static let ink = Color(red: 0.96, green: 0.94, blue: 0.90)
    static let amber = Color(red: 1, green: 0.70, blue: 0.25)
}

struct StageCorners: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let length: CGFloat = 19
        for (x, y, dx, dy) in [(rect.minX, rect.minY, 1.0, 1.0), (rect.maxX, rect.minY, -1.0, 1.0), (rect.minX, rect.maxY, 1.0, -1.0), (rect.maxX, rect.maxY, -1.0, -1.0)] {
            p.move(to: CGPoint(x: x, y: y + dy * length))
            p.addLine(to: CGPoint(x: x, y: y))
            p.addLine(to: CGPoint(x: x + dx * length, y: y))
        }
        return p
    }
}

struct DreamCaptureScreen: View {
    @ObservedObject var studio: Studio
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var recording: Bool { studio.state == .recording }
    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            let scale = min(width / 1680, height / 945)
            ZStack {
                Color.black
                SwiftUI.TimelineView(.animation(minimumInterval: 1 / 24, paused: reduceMotion)) { timeline in
                    Canvas { context, size in
                        let time = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                        let energy = recording && !reduceMotion ? min(1, studio.meter * 16) : 0
                        let horizon = CGRect(x: size.width * 0.12, y: size.height * 0.79, width: size.width * 0.76, height: size.height * 0.075)
                        var glow = context
                        glow.addFilter(.blur(radius: 18 * scale))
                        glow.fill(Path(ellipseIn: horizon), with: .radialGradient(Gradient(colors: [Cinema.amber.opacity(0.15), .clear]), center: CGPoint(x: size.width * 0.5, y: size.height * 0.825), startRadius: 0, endRadius: size.width * 0.37))
                        for index in 0..<5000 {
                            let seed = Double(index)
                            let x = (sin(seed * 127.1) * 43758.5453).fraction
                            let depth = (sin(seed * 311.7) * 19341.517).fraction
                            let concentration = max(0, 1 - abs(x - 0.5) * 2)
                            let drift = sin(time * 0.35 + seed) * 0.004
                            let rise = pow(depth, 5) * concentration * (0.25 + energy * 0.08)
                            let point = CGPoint(x: size.width * (x + drift), y: size.height * (0.825 - rise))
                            let radius = (0.4 + depth * 0.75) * scale
                            let opacity = (0.10 + depth * 0.36) * concentration * (reduceMotion ? 1 : 0.75 + sin(time + seed) * 0.25)
                            context.fill(Path(ellipseIn: CGRect(x: point.x, y: point.y, width: radius * 2, height: radius * 2)), with: .color(Cinema.amber.opacity(opacity)))
                        }
                    }
                }.accessibilityHidden(true)
                Text("RE:LIGHT")
                    .font(.system(size: 40 * scale, weight: .medium)).tracking(7 * scale).foregroundStyle(Cinema.ink)
                    .position(x: width * 0.5, y: height * 0.185)
                Text(recording ? "กำลังบันทึกเสียงความฝันของคุณ" : "กดปุ่มบันทึกเสียงสีแดง แล้วบอกความฝันของคุณ")
                    .font(.system(size: 62 * scale, weight: .semibold))
                    .lineLimit(1).minimumScaleFactor(0.5)
                    .multilineTextAlignment(.center).foregroundStyle(Cinema.ink)
                    .frame(width: width * 0.88)
                    .position(x: width * 0.5, y: height * 0.455)
                HStack(spacing: 24 * scale) {
                    Rectangle().frame(height: max(1, 2 * scale))
                    Text(recording ? "กำลังรับเสียง / RECORDING" : "บันทึกความฝัน / RECORD")
                        .font(.system(size: 32 * scale, weight: .regular)).fixedSize()
                    ZStack(alignment: .trailing) {
                        Rectangle().frame(height: max(1, 2 * scale))
                        Image(systemName: "arrow.right").font(.system(size: 25 * scale, weight: .light))
                    }
                }.foregroundStyle(Cinema.amber)
                    .frame(width: width * 0.68)
                    .position(x: width * 0.5, y: height * 0.57)
                if recording {
                    VStack(spacing: 8 * scale) {
                        HStack(spacing: 10 * scale) {
                            ZStack {
                                Circle().stroke(Color.red.opacity(0.5), lineWidth: 1).frame(width: 28 * scale, height: 28 * scale)
                                Circle().fill(.red).frame(width: 12 * scale, height: 12 * scale)
                                    .scaleEffect(reduceMotion ? 1 : 1 + min(0.7, studio.meter * 12))
                            }.frame(width: 30 * scale, height: 30 * scale).accessibilityHidden(true)
                            Text(studio.isManualRecording ? String(format: "%.1f วินาที · กดหยุดเมื่อพร้อม", studio.recordingSeconds) : String(format: "%.1f / %.0f วินาที", studio.recordingSeconds, studio.scene.capture?.durationSeconds ?? 6))
                                .monospacedDigit().font(.system(size: 24 * scale))
                        }.foregroundStyle(Cinema.ink)
                        if !studio.isManualRecording {
                            ProgressView(value: studio.recordingSeconds, total: studio.scene.capture?.durationSeconds ?? 6)
                                .tint(.red).frame(width: width * 0.35)
                        }
                    }.position(x: width * 0.5, y: height * 0.655)
                }
                VStack(spacing: 8 * scale) {
                    Text("เสียงของคุณจะใช้เฉพาะในประสบการณ์นี้ และจะถูกลบทันทีเมื่อจบ")
                        .font(.system(size: 27 * scale)).foregroundStyle(Cinema.ink.opacity(0.65))
                    Text("เลือกดำเนินต่อโดยไม่บันทึกได้ · ไม่อัปโหลดเสียง")
                        .font(.system(size: 17 * scale)).foregroundStyle(Cinema.ink.opacity(0.5))
                }.lineLimit(1).minimumScaleFactor(0.6).frame(width: width * 0.9)
                    .position(x: width * 0.5, y: height * 0.92)
            }

        }
    }
}

private extension Double {
    var fraction: Double { self - floor(self) }
}

struct FloatingNavigation: View {
    @ObservedObject var studio: Studio
    @Namespace private var selection
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sun.max.fill").foregroundStyle(Cinema.amber).font(.system(size: 17))
                Text("RE:Light").font(.system(size: 15, weight: .semibold)).tracking(-0.3)
            }.padding(.leading, 5)
            Divider().frame(height: 22)
            HStack(spacing: 3) {
                ForEach(Workspace.allCases, id: \.self) { workspace in
                    Button {
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.22)) { studio.workspace = workspace }
                    } label: {
                        Text(workspace.rawValue).font(.system(size: 13, weight: .semibold)).foregroundStyle(studio.workspace == workspace ? Color.black : Cinema.ink.opacity(0.8))
                            .frame(width: 68, height: 34)
                            .background {
                                if studio.workspace == workspace { Capsule().fill(Cinema.amber).matchedGeometryEffect(id: "workspace", in: selection) }
                            }.contentShape(Capsule())
                    }.buttonStyle(.plain).disabled(studio.locked).accessibilityLabel("\(workspace.rawValue) workspace").accessibilityAddTraits(studio.workspace == workspace ? [.isSelected] : [])
                }
            }.accessibilityIdentifier("workspace-picker")
            Divider().frame(height: 22)
            Menu {
                Button("This Mac") { studio.continueWithMac() }
                Button("Exhibition kit") { studio.chooseExhibition(); studio.showDevices = true }
            } label: { Label(studio.setup.rawValue, systemImage: studio.setup == .mac ? "laptopcomputer" : "videoprojector").font(.system(size: 12, weight: .medium)) }.menuStyle(.borderlessButton).fixedSize().disabled(studio.locked)
            Button { studio.showDevices = true } label: { Label("Devices", systemImage: "cable.connector").frame(height: 34).contentShape(Rectangle()) }.buttonStyle(.plain).accessibilityIdentifier("devices-button").help("Connect and test devices")
            Button { studio.save() } label: { Image(systemName: "square.and.arrow.down").frame(width: 32, height: 34).contentShape(Rectangle()) }.buttonStyle(.plain).disabled(!studio.dirty || studio.locked).accessibilityLabel("Save project").help("Save project · ⌘S")
            Button { studio.showHelp = true } label: { Image(systemName: "questionmark.circle").frame(width: 32, height: 34).contentShape(Rectangle()) }.buttonStyle(.plain).accessibilityLabel("Help").help("Help and troubleshooting")
        }.font(.system(size: 13)).foregroundStyle(Cinema.ink)
            .padding(.horizontal, 16).padding(.vertical, 11)
            .modifier(CinemaGlass())
            .shadow(color: .black.opacity(0.3), radius: 18, y: 8)
    }
}

struct CinemaGlass: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    func body(content: Content) -> some View {
        if reduceTransparency { content.background(Cinema.panel, in: Capsule()) }
        else if #available(macOS 26.0, *) { content.glassEffect(.regular, in: Capsule()) }
        else { content.background(.ultraThinMaterial, in: Capsule()).overlay(Capsule().strokeBorder(.white.opacity(0.13))) }
    }
}
