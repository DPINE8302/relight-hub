import AppKit
import AVFoundation
import RELightCore
import SwiftUI

final class VideoLayerView: NSView {
    let video = AVPlayerLayer()
    override init(frame: NSRect) { super.init(frame: frame); wantsLayer = true; layer?.backgroundColor = NSColor.black.cgColor; layer?.addSublayer(video); video.videoGravity = .resizeAspect }
    required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }
    override func layout() { super.layout(); video.frame = bounds }
}
struct PlayerSurface: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context: Context) -> VideoLayerView { let view = VideoLayerView(); view.video.player = player; return view }
    func updateNSView(_ view: VideoLayerView, context: Context) { view.video.player = player }
}

struct AudienceView: View {
    @ObservedObject var studio: Studio
    var isPreview = false
    var body: some View {
        ZStack {
            Color.black
            if !studio.isBlack && (isPreview || ![.idle, .finished, .preparing].contains(studio.state)) {
                if studio.hasVideo { PlayerSurface(player: studio.player) }
                else { VStack(spacing: 14) { Text(studio.scene.thai).font(.system(size: 44, weight: .medium)); Text("SCENE FILM NOT SUPPLIED").font(.system(size: 12, weight: .semibold)).tracking(2).foregroundStyle(.gray) }.foregroundStyle(.white) }
            }
            if !isPreview && studio.identifyingDisplay {
                VStack(spacing: 20) { Image(systemName: "videoprojector").font(.system(size: 52)); Text("RE:Light").font(.system(size: 48, weight: .semibold)); Text("DISPLAY CHECK · \(studio.externalScreen?.localizedName ?? "Mac display")").font(.system(size: 16, weight: .medium)); Text("Confirm picture, framing, and placement in Devices.").font(.system(size: 18)) }.foregroundStyle(.white)
                Rectangle().stroke(.white, lineWidth: 3).padding(24)
            }
            if studio.state == .gate || studio.state == .recording && studio.scene.capture?.trigger == .gate {
                DreamCaptureScreen(studio: studio)
            }
            if studio.setup == .mac && !studio.isBlack {
                VStack { HStack { Label("REHEARSAL\(studio.scene.draft ? " · DRAFT" : "")", systemImage: "circle.dashed").font(.system(size: 11, weight: .semibold)).padding(10).background(.black.opacity(0.7), in: Capsule()); Spacer() }; Spacer() }.padding(16).foregroundStyle(.white.opacity(0.8))
            }
        }.ignoresSafeArea().accessibilityElement(children: .contain).accessibilityLabel("Audience output: \(studio.scene.name)")
    }
}

struct WorkspaceView: View {
    @ObservedObject var studio: Studio
    @State private var showEditor = false
    @State private var openDevicesAfterEditor = false
    var body: some View {
        VStack(spacing: 0) {
            FloatingNavigation(studio: studio).padding(.top, 16).padding(.bottom, 22)
            if let issue = studio.issue {
                HStack(spacing: 10) { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange); Text(issue).font(.callout).lineLimit(3); Spacer(); Button("Fix…") { studio.showDevices = true }; Button { studio.issue = nil } label: { Image(systemName: "xmark") }.buttonStyle(.plain).accessibilityLabel("Dismiss issue") }.padding(12).background(Color.orange.opacity(0.10))
                Divider()
            }
            sceneRibbon
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(studio.scene.name).font(.system(size: 27, weight: .semibold)).tracking(-0.7).lineLimit(2)
                        Text("\(studio.scene.frames) frames · \(String(format: "%g", studio.project.rate.fps)) fps\(studio.scene.draft ? " · Draft" : "")").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(studio.timecode).monospacedDigit().font(.system(size: 23, weight: .light, design: .monospaced))
                    Button { studio.openAudience() } label: { Label("Audience", systemImage: "rectangle.on.rectangle") }.help("Open audience output on the selected display")
                }.padding(.horizontal, 28).padding(.vertical, 16)
                GeometryReader { geometry in
                    AudienceView(studio: studio, isPreview: true)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .overlay(StageCorners().stroke(Cinema.amber.opacity(0.65), lineWidth: 1).padding(-5))
                        .frame(width: geometry.size.width, height: geometry.size.height)
                }.padding(.horizontal, 28).padding(.vertical, 6).frame(minHeight: 200)
                if studio.workspace == .edit && studio.state != .gate && studio.state != .recording {
                    HStack {
                        Button("Scene settings…") { studio.selectedCue = nil; showEditor = true }.disabled(studio.locked)
                        Button("Voice & effects…") { studio.selectedCue = studio.selectedVoice?.id ?? studio.scene.cues.first?.id; showEditor = true }.disabled(studio.locked || studio.scene.cues.isEmpty)
                        Spacer()
                        Text("Select a voice region to edit its timing and sound.").font(.caption).foregroundStyle(.secondary)
                    }.padding(.horizontal, 28).padding(.top, 12)
                    TimelineView(studio: studio, onSelectCue: { showEditor = true }).padding(.horizontal, 28).padding(.vertical, 12)
                } else { runGuidance.padding(.horizontal, 28).padding(.vertical, 16) }
                transport
            }
            Divider()
            HStack(spacing: 10) {
                Image(systemName: studio.state == .recording ? "record.circle.fill" : "circle.fill").foregroundStyle(studio.state == .recording ? .red : .secondary).font(.system(size: 8))
                Text(studio.note).font(.caption).lineLimit(2)
                Spacer()
                if studio.takeSeconds > 0 { Label(String(format: "Voice %.1fs · temporary", studio.takeSeconds), systemImage: "waveform").font(.caption).foregroundStyle(.secondary) }
                Text(studio.dirty ? "Unsaved changes" : "Saved project").font(.caption).foregroundStyle(.secondary)
            }.padding(.horizontal, 16).padding(.vertical, 10).background(Cinema.panel)
        }
        .frame(minWidth: 850, minHeight: 700)
        .background(Cinema.canvas)
        .foregroundStyle(Cinema.ink)
        .tint(Cinema.amber)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showEditor, onDismiss: {
            if openDevicesAfterEditor { openDevicesAfterEditor = false; studio.showDevices = true }
        }) {
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) { Text(studio.scene.name).font(.headline); Text("Timing, recording and sound").font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    Button("Done") { showEditor = false }.keyboardShortcut(.cancelAction)
                }.padding(20)
                Divider()
                InspectorView(studio: studio, onSetupMicrophone: { openDevicesAfterEditor = true; showEditor = false })
            }.frame(width: 620, height: 650).tint(Cinema.amber).preferredColorScheme(.dark)
        }
        .sheet(isPresented: $studio.showDevices) { DevicesView(studio: studio).tint(Cinema.amber).preferredColorScheme(.dark) }
        .sheet(isPresented: $studio.showHelp) { TroubleshootingView(studio: studio).tint(Cinema.amber).preferredColorScheme(.dark) }
        .sheet(isPresented: $studio.showConsent) {
            VStack(alignment: .leading, spacing: 18) {
                Label("This project has timed recording", systemImage: "mic.circle").font(.title2.weight(.semibold))
                Text("Capture starts automatically at the frames you authored. Obtain the participant’s consent before starting. Voice stays in memory and is deleted when the run finishes or stops.")
                HStack { Button("Cancel") { studio.showConsent = false }; Button("Run without voice") { studio.showConsent = false; studio.beginRun(consented: false) }; Button("Participant consented — Run") { studio.showConsent = false; studio.beginRun(consented: true) }.buttonStyle(.borderedProminent) }
            }.padding(28).frame(width: 560)
        }
    }
    private var sceneRibbon: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(studio.project.scenes.enumerated()), id: \.element.id) { index, scene in
                    Button { studio.selectScene(index) } label: {
                        HStack(spacing: 8) {
                            Text(String(format: "%02d", index + 1)).monospacedDigit().foregroundStyle(index == studio.selectedScene ? Cinema.amber : Cinema.ink.opacity(0.55))
                            Text(scene.name).lineLimit(1)
                            if studio.mediaChecks[scene.id]?.valid != true { Image(systemName: "rectangle.dashed").foregroundStyle(.secondary) }
                        }.font(.system(size: 12, weight: .medium)).padding(.horizontal, 14).frame(height: 40)
                            .background(index == studio.selectedScene ? Cinema.ink.opacity(0.10) : .clear, in: Capsule())
                            .contentShape(Capsule())
                    }.buttonStyle(.plain).disabled(studio.locked)
                        .accessibilityLabel("Scene \(index + 1), \(scene.name)\(studio.mediaChecks[scene.id]?.valid == true ? "" : ", film needed")")
                        .accessibilityAddTraits(index == studio.selectedScene ? .isSelected : [])
                }
            }.padding(.horizontal, 28)
        }.frame(height: 44)
    }
    private var runGuidance: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(studio.state.rawValue, systemImage: studio.state == .recording ? "mic.fill" : "play.circle").font(.headline)
                Spacer()
                if !studio.locked { Text(studio.missingFilms == 0 ? "All scene films available" : "\(studio.missingFilms) \(studio.missingFilms == 1 ? "scene uses" : "scenes use") rehearsal text").font(.caption).foregroundStyle(.secondary) }
            }
            if studio.state == .gate {
                Text("Ask for consent. Record the participant’s dream or continue with the silent variant. The film clock is paused.").foregroundStyle(.secondary)
                HStack { Button("Continue without recording") { studio.declineAtGate() }; Button("Consent & Record") { studio.recordAtGate() }.buttonStyle(.borderedProminent).tint(.red).disabled(studio.permission != .authorized) }
                if studio.permission != .authorized { Button("Set up microphone…") { studio.showDevices = true } }
            } else if studio.state == .recording {
                if !studio.isManualRecording { ProgressView(value: studio.recordingSeconds, total: studio.scene.capture?.durationSeconds ?? 6).tint(.red) }
                Text(String(format: "%.1f seconds · capture stays temporary", studio.recordingSeconds)).monospacedDigit().font(.callout)
                Button { studio.finishRecording() } label: { Label(studio.isManualRecording ? "Stop & Continue" : "Finish recording", systemImage: "stop.fill").padding(.horizontal, 12).padding(.vertical, 6) }.buttonStyle(.borderedProminent).tint(.red).disabled(studio.recordingSeconds < 0.2).keyboardShortcut(.return, modifiers: []).help("Stop recording and continue the scene sequence")
            } else if let blocker = studio.blockers.first, !studio.locked {
                Text(blocker).foregroundStyle(.secondary); Button("Resolve setup…") { studio.showDevices = true }
            } else {
                Text(studio.setup == .mac ? "Rehearse the full sequence with this Mac’s devices. Draft and text scenes stay labeled." : "Run the authored sequence on the verified exhibition kit.").foregroundStyle(.secondary)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var transport: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                if studio.setup == .mac {
                    Button { studio.restartScene() } label: { Image(systemName: "backward.end") }.help("Restart scene").disabled(studio.state != .playing && studio.state != .paused)
                }
                Button { studio.togglePlayback() } label: { Label(studio.state == .playing ? "Pause" : studio.state == .paused ? "Resume" : "Start", systemImage: studio.state == .playing ? "pause.fill" : "play.fill").frame(minWidth: 70) }.buttonStyle(.borderedProminent).disabled([.gate, .recording, .preparing].contains(studio.state) || studio.auditioning).accessibilityIdentifier("start-button")
                if studio.setup == .mac { Button { studio.nextScene() } label: { Image(systemName: "forward.end") }.help("Next scene").disabled(studio.state != .playing && studio.state != .paused) }
                Spacer()
                if studio.setup == .mac { Picker("Speed", selection: $studio.speed) { Text("1×").tag(1.0); Text("2×").tag(2.0); Text("4×").tag(4.0) }.frame(width: 90).disabled(studio.locked).help("Rehearsal picture speed. Recording always runs in real time.") }
                Button(role: .destructive) { studio.stop() } label: { Label("Stop & Clear", systemImage: "stop.fill") }.keyboardShortcut(".", modifiers: .command).help("Immediately stop output and delete the participant recording").accessibilityIdentifier("stop-clear-button")
            }.padding(14).background(Cinema.panel, in: Capsule()).overlay(Capsule().strokeBorder(.white.opacity(0.10))).padding(.horizontal, 20).padding(.bottom, 16)
        }
    }
}

struct TimelineView: View {
    @ObservedObject var studio: Studio
    var onSelectCue: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack { Text("SCENE CUES").font(.caption.weight(.semibold)).foregroundStyle(.secondary); Spacer(); Button { studio.addCue(); onSelectCue?() } label: { Label("Voice cue", systemImage: "plus") }.disabled(studio.locked) }
            Slider(value: Binding(get: { Double(studio.frame) }, set: { studio.seek(Int($0)) }), in: 0...Double(max(1, studio.scene.frames - 1)), step: 1).disabled(studio.state == .gate || studio.state == .recording).accessibilityLabel("Scene position in frames")
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 5).fill(Color.primary.opacity(0.04))
                    ForEach(studio.scene.cues) { cue in
                        let width = geometry.size.width * Double(cue.lengthFrames) / Double(studio.scene.frames)
                        Button { studio.selectedCue = cue.id; onSelectCue?() } label: { HStack(spacing: 4) { Image(systemName: "waveform"); Text(cue.name).lineLimit(1) }.font(.caption).padding(.horizontal, 8).frame(width: max(22, width), height: 34).background(studio.selectedCue == cue.id ? Cinema.amber.opacity(0.35) : Cinema.amber.opacity(0.15), in: RoundedRectangle(cornerRadius: 5)).overlay(RoundedRectangle(cornerRadius: 5).stroke(studio.selectedCue == cue.id ? Cinema.amber : .clear)) }.buttonStyle(.plain).offset(x: geometry.size.width * Double(cue.startFrame) / Double(studio.scene.frames))
                            .gesture(DragGesture(minimumDistance: 4).onEnded { value in
                                guard !studio.locked else { return }; studio.selectedCue = cue.id
                                let delta = Int((value.translation.width / geometry.size.width * Double(studio.scene.frames)).rounded())
                                studio.mutateCue { $0.startFrame = max(0, min(studio.scene.frames - $0.lengthFrames, $0.startFrame + delta)) }
                            }).accessibilityLabel("\(cue.name), starts at frame \(cue.startFrame)")
                    }
                    Rectangle().fill(.orange).frame(width: 2).offset(x: geometry.size.width * Double(studio.frame) / Double(studio.scene.frames))
                }
            }.frame(height: 38).clipped()
            HStack { Text("Voice · \(studio.scene.cues.count) cues"); Spacer(); Text(studio.project.rate.timecode(studio.frame)).monospacedDigit(); Text("/ \(studio.project.rate.timecode(studio.scene.frames))").foregroundStyle(.secondary) }.font(.caption)
        }
    }
}

struct InspectorView: View {
    @ObservedObject var studio: Studio
    var onSetupMicrophone: () -> Void
    @State private var parameter: EffectParameter = .level
    @State private var presetName = "My preset"
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack { Text(studio.selectedVoice == nil ? "Scene" : "Voice cue").font(.headline); Spacer(); if studio.selectedVoice != nil { Button("Scene") { studio.selectedCue = nil }.font(.caption) } }
                if let cue = studio.selectedVoice { voiceInspector(cue) } else { sceneInspector }
                Divider()
                mixer
                if !studio.project.validation().isEmpty { VStack(alignment: .leading, spacing: 6) { Label("Project needs attention", systemImage: "exclamationmark.triangle").foregroundStyle(.orange); ForEach(studio.project.validation(), id: \.self) { Text($0).font(.caption) } } }
            }.padding(18)
        }.background(Color(nsColor: .controlBackgroundColor)).disabled(studio.locked)
    }
    private var sceneInspector: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(studio.scene.name).font(.title3.weight(.medium))
            Text(studio.mediaChecks[studio.scene.id]?.detail ?? "Checking media…").font(.caption).foregroundStyle(.secondary)
            Button("Choose scene film…") { studio.importMedia() }
            intField("Scene length frames", value: Binding(get: { studio.scene.frames }, set: { value in studio.mutate { $0.scenes[studio.selectedScene].frames = max(1, min(1_000_000, value)) }; Task { await studio.validateMedia() } }))
            intField("Media source in frame", value: Binding(get: { studio.scene.mediaInFrame }, set: { value in studio.mutate { $0.scenes[studio.selectedScene].mediaInFrame = max(0, min(1_000_000, value)) }; Task { await studio.validateMedia() } }))
            Text("Use a scene clip or an exact region of a longer film. Cue frames remain local to the scene.").font(.caption2).foregroundStyle(.secondary)
            Toggle("Final media approved", isOn: Binding(get: { !studio.scene.draft }, set: { value in studio.mutate { $0.scenes[studio.selectedScene].draft = !value } })).disabled(studio.mediaChecks[studio.scene.id]?.valid != true)
            Divider()
            Toggle("Record participant", isOn: Binding(get: { studio.scene.capture != nil }, set: { value in studio.mutate { $0.scenes[studio.selectedScene].capture = value ? CaptureCue() : nil } }))
            if let capture = studio.scene.capture {
                Picker("Recording mode", selection: Binding(get: { capture.recordingMode }, set: { mode in studio.mutate { $0.scenes[studio.selectedScene].capture?.mode = mode; if mode == .manual { $0.scenes[studio.selectedScene].capture?.trigger = .gate } } })) { Text("Timed").tag(CaptureCue.Mode.timed); Text("Start / Stop").tag(CaptureCue.Mode.manual) }.pickerStyle(.segmented)
                if capture.trigger == .gate {
                    Toggle("Recording screen at a scene frame", isOn: Binding(get: { capture.gateFrame != nil }, set: { enabled in studio.mutate { $0.scenes[studio.selectedScene].capture?.gateFrame = enabled ? 0 : nil } }))
                    if capture.gateFrame != nil { intField("Recording screen frame", value: Binding(get: { capture.gateFrame ?? 0 }, set: { frame in studio.mutate { $0.scenes[studio.selectedScene].capture?.gateFrame = frame } })) }
                    Text(capture.gateFrame == nil ? "Recording screen appears after the scene." : "Film pauses at this frame, then continues after recording or decline.").font(.caption).foregroundStyle(.secondary)
                }
                if capture.recordingMode == .manual {
                    Text("Start after consent. Press Stop & Continue when finished. The film clock stays paused; replay still follows your authored voice cues.").font(.caption).foregroundStyle(.secondary)
                    Text("Up to 10 minutes per take, held only in memory.").font(.caption2).foregroundStyle(.secondary)
                } else {
                Picker("Trigger", selection: Binding(get: { capture.trigger }, set: { trigger in studio.mutate { $0.scenes[studio.selectedScene].capture?.trigger = trigger; if trigger == .automatic { $0.scenes[studio.selectedScene].capture?.gateFrame = nil } } })) { Text("Consent gate").tag(CaptureCue.Trigger.gate); Text("Timed cue in scene").tag(CaptureCue.Trigger.automatic) }
                if capture.trigger == .automatic {
                    intField("Start frame", value: Binding(get: { capture.startFrame }, set: { frame in studio.mutate { $0.scenes[studio.selectedScene].capture?.startFrame = frame } }))
                    Text("\(studio.project.rate.timecode(capture.startFrame)) · consent required before Run").font(.caption).foregroundStyle(.secondary)
                } else { Text(capture.gateFrame == nil ? "Film clock pauses after the last frame. Record only after the participant consents." : "Film clock pauses at the recording-screen frame. Record only after the participant consents.").font(.caption).foregroundStyle(.secondary) }
                numberField("Capture seconds", value: Binding(get: { capture.durationSeconds }, set: { value in studio.mutate { $0.scenes[studio.selectedScene].capture?.durationSeconds = value } }))
                }
            }
            Divider()
            Text("Voice cues").font(.subheadline.weight(.semibold))
            ForEach(studio.scene.cues) { cue in Button { studio.selectedCue = cue.id } label: { HStack { Image(systemName: "waveform"); Text(cue.name); Spacer(); Text(studio.project.rate.timecode(cue.startFrame)).monospacedDigit() } }.buttonStyle(.plain).font(.caption) }
            Button("Add voice cue") { studio.addCue() }
        }
    }
    private func voiceInspector(_ cue: VoiceCue) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Cue name", text: Binding(get: { cue.name }, set: { name in studio.mutateCue { $0.name = name } })).textFieldStyle(.roundedBorder)
            Text("Source: current participant recording").font(.caption).foregroundStyle(.secondary)
            intField("Start frame", value: cueInt(\.startFrame)); Text(studio.project.rate.timecode(cue.startFrame)).monospacedDigit().font(.caption).foregroundStyle(.secondary)
            intField("Length frames", value: cueInt(\.lengthFrames)); intField("Source in frame", value: cueInt(\.sourceInFrame))
            Picker("Voice playback", selection: Binding(get: { cue.loopToFill == true ? 2 : (cue.repeatCount ?? 1) > 1 ? 1 : 0 }, set: { mode in studio.mutateCue { $0.loopToFill = mode == 2; $0.repeatCount = mode == 1 ? max(2, $0.repeatCount ?? 3) : 1 } })) { Text("Once").tag(0); Text("Repeat").tag(1); Text("Fill region").tag(2) }.pickerStyle(.segmented)
            if cue.loopToFill != true && (cue.repeatCount ?? 1) > 1 { Stepper("Repeat \(cue.repeatCount ?? 1) times", value: Binding(get: { cue.repeatCount ?? 1 }, set: { count in studio.mutateCue { $0.repeatCount = count } }), in: 2...100) }
            Text(cue.loopToFill == true ? "Loops the captured voice until this region ends, including a partial final repeat." : "Plays the chosen repetitions, trimmed to this region. Source in trims the beginning of each repeat.").font(.caption).foregroundStyle(.secondary)

            HStack { intField("Fade in", value: cueInt(\.fadeInFrames)); intField("Fade out", value: cueInt(\.fadeOutFrames)) }
            Divider()
            HStack { Text("Effects").font(.headline); Spacer(); Toggle("Bypass", isOn: Binding(get: { cue.bypass }, set: { value in studio.mutateCue { $0.bypass = value } })).toggleStyle(.checkbox) }
            Menu("Choose preset") {
                ForEach(["Clean", "Echo", "Decay", "Distorted"], id: \.self) { name in Button(name) { studio.mutateCue { $0.effects = .preset(name); $0.automation = name == "Decay" ? ["level": [AutomationPoint(frame: 0, value: 0.8), AutomationPoint(frame: $0.lengthFrames, value: 0)], "lowPassHz": [AutomationPoint(frame: 0, value: 12000), AutomationPoint(frame: $0.lengthFrames, value: 900)]] : [:] } } }
                Divider()
                ForEach(studio.project.effectPresets.keys.sorted(), id: \.self) { name in Button(name) { if let e = studio.project.effectPresets[name] { studio.mutateCue { $0.effects = e } } } }
            }
            ForEach(EffectParameter.allCases, id: \.self) { p in
                VStack(alignment: .leading, spacing: 3) {
                    HStack { Text(label(p)).font(.caption); Spacer(); Text(display(cue.effects[p], p)).font(.caption).monospacedDigit().foregroundStyle(.secondary) }
                    Slider(value: Binding(get: { cue.effects[p] }, set: { value in studio.mutateCue { $0.effects[p] = value } }), in: EffectSettings.range(p)).accessibilityLabel(label(p))
                }
            }
            HStack { TextField("Preset name", text: $presetName).textFieldStyle(.roundedBorder); Button("Save") { studio.mutate { $0.effectPresets[presetName] = cue.effects } }.disabled(presetName.trimmingCharacters(in: .whitespaces).isEmpty) }
            DisclosureGroup("Automation") {
                VStack(alignment: .leading, spacing: 8) {
                    Picker("Parameter", selection: $parameter) { ForEach(EffectParameter.allCases, id: \.self) { Text(label($0)).tag($0) } }
                    ForEach(cue.automation[parameter.rawValue] ?? []) { point in
                        HStack {
                            TextField("Frame", value: Binding(get: { point.frame }, set: { frame in editPoint(point.id) { $0.frame = frame } }), format: .number).frame(width: 60)
                            TextField("Value", value: Binding(get: { point.value }, set: { value in editPoint(point.id) { $0.value = value } }), format: .number).frame(width: 70)
                            Button { studio.mutateCue { $0.automation[parameter.rawValue]?.removeAll { $0.id == point.id } } } label: { Image(systemName: "minus.circle") }
                        }.textFieldStyle(.roundedBorder)
                    }
                    Button("Add point at playhead") {
                        studio.mutateCue { c in
                            let frame = max(0, min(c.lengthFrames, studio.frame - c.startFrame))
                            c.automation[parameter.rawValue, default: []].removeAll { $0.frame == frame }
                            c.automation[parameter.rawValue, default: []].append(AutomationPoint(frame: frame, value: c.effects[parameter]))
                        }
                    }
                    Text("Frames are relative to this cue. Values interpolate linearly. Automation overrides the matching effect control.").font(.caption2).foregroundStyle(.secondary)
                }.padding(.top, 8)
            }
            Divider()
            Menu("Record test take") { Button("Timed · 6 seconds") { studio.recordTest() }; Button("Start / Stop") { studio.recordTest(manual: true) } }.disabled(studio.permission != .authorized)
            if studio.permission != .authorized { Button("Set up microphone…", action: onSetupMicrophone) }
            HStack { Button("Dry") { studio.audition(dry: true) }; Button("Processed") { studio.audition() } }.disabled(studio.takeSeconds == 0)
            Text("Test takes stay in memory and are cleared before a live run.").font(.caption2).foregroundStyle(.secondary)
            Button("Remove cue", role: .destructive) { studio.removeCue() }
        }
    }
    private var mixer: some View {
        DisclosureGroup("Mix & output timing") {
            VStack(alignment: .leading, spacing: 10) {
                mixSlider("Film", key: \.filmLevel); mixSlider("Visitor voice", key: \.voiceLevel); mixSlider("Film during voice", key: \.duckLevel)
                Toggle("End on black", isOn: Binding(get: { studio.project.blackFromFrame != nil }, set: { enabled in studio.mutate { $0.blackFromFrame = enabled ? max(0, $0.totalFrames - 72) : nil } }))
                if studio.project.blackFromFrame != nil { intField("Ending black — global frame", value: Binding(get: { studio.project.blackFromFrame ?? 0 }, set: { value in studio.mutate { $0.blackFromFrame = max(0, min($0.totalFrames, value)) } })) }
                numberField("Voice advance (ms)", value: Binding(get: { studio.project.outputOffsetMs }, set: { value in studio.mutate { $0.outputOffsetMs = value } }))
                Text("Positive values advance voice to compensate output latency. Measure against the actual projector and speakers.").font(.caption2).foregroundStyle(.secondary)
            }.padding(.top, 10)
        }
    }
    private func cueInt(_ key: WritableKeyPath<VoiceCue, Int>) -> Binding<Int> { Binding(get: { studio.selectedVoice?[keyPath: key] ?? 0 }, set: { value in studio.mutateCue { $0[keyPath: key] = max(key == \VoiceCue.lengthFrames ? 1 : 0, min(1_000_000, value)) } }) }
    private func editPoint(_ id: UUID, _ change: (inout AutomationPoint) -> Void) { studio.mutateCue { cue in if let index = cue.automation[parameter.rawValue]?.firstIndex(where: { $0.id == id }) { change(&cue.automation[parameter.rawValue]![index]) } } }
    private func mixSlider(_ label: String, key: WritableKeyPath<Project, Double>) -> some View { VStack(alignment: .leading, spacing: 3) { Text(label).font(.caption); Slider(value: Binding(get: { studio.project[keyPath: key] }, set: { value in studio.mutate { $0[keyPath: key] = value } }), in: 0...1).accessibilityLabel(label) } }
    private func intField(_ label: String, value: Binding<Int>) -> some View { VStack(alignment: .leading, spacing: 4) { Text(label).font(.caption).foregroundStyle(.secondary); TextField(label, value: value, format: .number).textFieldStyle(.roundedBorder).monospacedDigit() } }
    private func numberField(_ label: String, value: Binding<Double>) -> some View { VStack(alignment: .leading, spacing: 4) { Text(label).font(.caption).foregroundStyle(.secondary); TextField(label, value: value, format: .number).textFieldStyle(.roundedBorder).monospacedDigit() } }
    private func label(_ p: EffectParameter) -> String { switch p { case .level: "Level"; case .lowPassHz: "Low-pass filter"; case .delayMs: "Echo time"; case .delayWet: "Echo mix"; case .feedback: "Echo feedback"; case .reverbWet: "Reverb mix"; case .distortion: "Distortion mix"; case .pan: "Stereo pan" } }
    private func display(_ value: Double, _ p: EffectParameter) -> String { switch p { case .lowPassHz: "\(Int(value)) Hz"; case .delayMs: "\(Int(value)) ms"; case .pan: String(format: "%+.2f", value); default: "\(Int(value * 100))%" } }
}

struct DevicesView: View {
    @ObservedObject var studio: Studio
    @ObservedObject var hardware: Hardware
    @Environment(\.dismiss) private var dismiss
    init(studio: Studio) { self.studio = studio; hardware = studio.hardware }
    var body: some View {
        VStack(spacing: 0) {
            HStack { VStack(alignment: .leading, spacing: 5) { Text("Devices").font(.title2.weight(.semibold)); Text("The same experience, using the devices you choose.").foregroundStyle(.secondary) }; Spacer(); Button("Done") { dismiss() }.keyboardShortcut(.defaultAction) }.padding(24)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let issue = studio.issue { Label(issue, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.callout).textSelection(.enabled) }
                    HStack { Picker("Setup", selection: Binding(get: { studio.setup }, set: { value in if value == .mac { studio.continueWithMac() } else { studio.chooseExhibition() } })) { ForEach(SetupKind.allCases, id: \.self) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented).frame(width: 260); Spacer(); Button("Continue with this Mac") { studio.continueWithMac() } }.disabled(studio.locked)
                    GroupBox {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack { Label("Microphone", systemImage: "mic").font(.headline); Spacer(); status(studio.microphonePassed ? "Signal passed" : "Not tested", passed: studio.microphonePassed) }
                            Picker("Input", selection: $studio.inputUID) { Text("System input").tag(""); ForEach(studio.devices.filter(\.input)) { Text($0.name).tag($0.uid) }; if studio.configuredInputMissing { Text("Saved microphone · disconnected").tag(studio.inputUID) } }.disabled(studio.locked).onChange(of: studio.inputUID) { _, _ in studio.deviceChanged() }
                            HStack {
                                if studio.permission == .notDetermined { Button("Allow microphone") { studio.allowMicrophone() } }
                                else if studio.permission != .authorized { Button("Open Microphone Settings") { studio.microphoneSettings() } }
                                Button("Test signal") { studio.testMicrophone() }.disabled(studio.permission != .authorized || studio.locked)
                                ProgressView(value: min(1, studio.meter * 8)).frame(width: 140)
                                Text(studio.peak > 0.98 ? "Clipping" : String(format: "%.0f%%", min(1, studio.meter * 8) * 100)).font(.caption).monospacedDigit()
                            }
                            Text("Never monitored through speakers. Voice stays temporary and is cleared after each run.").font(.caption).foregroundStyle(.secondary)
                        }.padding(10)
                    }
                    GroupBox {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack { Label("Speakers", systemImage: "speaker.wave.2").font(.headline); Spacer(); status(studio.speakersPassed ? "Confirmed" : "Not confirmed", passed: studio.speakersPassed) }
                            Picker("Output", selection: $studio.outputUID) { Text("System output").tag(""); ForEach(studio.devices.filter(\.output)) { Text($0.name).tag($0.uid) }; if studio.configuredOutputMissing { Text("Saved speakers · disconnected").tag(studio.outputUID) } }.disabled(studio.locked).onChange(of: studio.outputUID) { _, _ in studio.deviceChanged() }
                            HStack { Button("Play test tone") { studio.testSpeakers() }.disabled(studio.locked); Button("I heard it on these speakers") { studio.confirmSpeakers() }.disabled(!studio.tonePlayed).disabled(studio.locked) }
                        }.padding(10)
                    }
                    GroupBox {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack { Label("Display / projector", systemImage: "videoprojector").font(.headline); Spacer(); status(studio.projectorPassed ? "Confirmed" : "Not confirmed", passed: studio.projectorPassed) }
                            Picker("Display", selection: $studio.screenID) { Text("Mac display").tag(""); ForEach(studio.screens, id: \.self) { Text($0.localizedName).tag(Studio.id($0)) } }.disabled(studio.locked).onChange(of: studio.screenID) { _, _ in studio.deviceChanged(); studio.closeAudience() }
                            HStack { Button("Open audience output") { studio.openAudience() }; Button("Picture is correct") { studio.confirmPicture() }.disabled(studio.locked || !studio.canConfirmPicture) }
                            Text("Use an extended display for exhibition. Confirm the actual picture, aspect ratio, and physical placement.").font(.caption).foregroundStyle(.secondary)
                        }.padding(10)
                    }
                    if studio.setup == .exhibition {
                        GroupBox {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Physical controls", systemImage: "button.programmable").font(.headline)
                                HStack { Text("Input Monitoring: \(hardware.access)").font(.caption); Spacer(); Button("Allow USB controls") { hardware.requestAccess() }.disabled(studio.locked) }
                                ForEach(["RECORD_BUTTON", "CHOICE_BUTTON"], id: \.self) { role in
                                    HStack { VStack(alignment: .leading) { Text(role == "RECORD_BUTTON" ? "Record / Consent" : "Continue / Decline"); Text(hardware.label(role)).font(.caption).foregroundStyle(.secondary) }; Spacer(); status(hardware.connected(role) && hardware.tested.contains(role) ? "Tested" : "Needs test", passed: hardware.connected(role) && hardware.tested.contains(role)); Button("Assign…") { hardware.assign(role) }.disabled(studio.locked) }
                                }
                                Text(hardware.message).font(.caption).foregroundStyle(.secondary)
                                if hardware.learning != nil { Button("Cancel assignment") { hardware.cancel() } }
                                Text("Only assigned external USB elements are used. No global keyboard logging. Some controls bind to their USB port.").font(.caption).foregroundStyle(.secondary)
                            }.padding(10)
                        }
                    }
                    if !studio.blockers.isEmpty { VStack(alignment: .leading, spacing: 8) { Text("Before starting").font(.headline); ForEach(studio.blockers, id: \.self) { Label($0, systemImage: "exclamationmark.circle").font(.callout).foregroundStyle(.secondary) } } }
                    HStack { Button("Refresh devices") { studio.refreshDevices(); hardware.refresh() }; Button("Troubleshooting…") { dismiss(); studio.showHelp = true }; Spacer(); Text(studio.note).font(.caption).foregroundStyle(.secondary).lineLimit(3) }
                }.padding(24)
            }
        }.frame(width: 690, height: 730)
    }
    private func status(_ text: String, passed: Bool) -> some View { Label(text, systemImage: passed ? "checkmark.circle.fill" : "circle.dashed").font(.caption).foregroundStyle(passed ? .green : .secondary) }
}

struct TroubleshootingView: View {
    @ObservedObject var studio: Studio
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack { Text("Help & Troubleshooting").font(.title2.weight(.semibold)); Spacer(); Button("Done") { dismiss() }.keyboardShortcut(.defaultAction) }
            Text("Choose devices → test signal, sound, and picture → Run. Use Edit to place voice cues and shape the sound. Rehearsal uses the same project with local devices.").foregroundStyle(.secondary)
            SupportTextSurface(text: studio.supportText).frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack { Button("Validate media") { Task { await studio.validateMedia() } }; Button("Export support report…") { studio.exportDiagnostics() }; Spacer(); Button("Open project folder") { NSWorkspace.shared.open(studio.root) } }
        }.padding(24).frame(width: 760, height: 700)
    }
}

struct SupportTextSurface: NSViewRepresentable {
    let text: String
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.borderType = .noBorder
        let view = NSTextView(); view.isEditable = false; view.isSelectable = true
        view.font = .monospacedSystemFont(ofSize: 12, weight: .regular); view.textColor = .labelColor
        view.backgroundColor = .textBackgroundColor; view.textContainerInset = NSSize(width: 14, height: 14)
        view.isVerticallyResizable = true; view.isHorizontallyResizable = false
        view.autoresizingMask = [.width]; view.textContainer?.widthTracksTextView = true
        scroll.documentView = view; view.string = text
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) { if let view = scroll.documentView as? NSTextView, view.string != text { view.string = text } }
}
