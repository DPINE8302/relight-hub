import AppKit
import Foundation
let destination = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let image = NSImage(size: NSSize(width: pixels, height: pixels))
        image.lockFocus()
        let p = CGFloat(pixels)
        let base = NSBezierPath(roundedRect: NSRect(x: p * 0.035, y: p * 0.035, width: p * 0.93, height: p * 0.93), xRadius: p * 0.215, yRadius: p * 0.215)
        NSGradient(starting: NSColor(calibratedRed: 0.19, green: 0.20, blue: 0.24, alpha: 1), ending: NSColor(calibratedRed: 0.055, green: 0.065, blue: 0.085, alpha: 1))!.draw(in: base, angle: -90)
        let glow = NSBezierPath(ovalIn: NSRect(x: p * 0.35, y: p * 0.35, width: p * 0.30, height: p * 0.30))
        NSGradient(starting: NSColor(calibratedRed: 1, green: 0.87, blue: 0.62, alpha: 1), ending: NSColor(calibratedRed: 1, green: 0.57, blue: 0.21, alpha: 1))!.draw(in: glow, angle: -90)
        NSColor(calibratedRed: 1, green: 0.76, blue: 0.40, alpha: 1).setStroke()
        for ray in 0..<8 {
            let a = Double(ray) * .pi / 4
            let line = NSBezierPath(); line.lineWidth = p * 0.034; line.lineCapStyle = .round
            line.move(to: NSPoint(x: p * (0.5 + 0.23 * cos(a)), y: p * (0.5 + 0.23 * sin(a))))
            line.line(to: NSPoint(x: p * (0.5 + 0.32 * cos(a)), y: p * (0.5 + 0.32 * sin(a))))
            line.stroke()
        }
        image.unlockFocus()
        let representation = NSBitmapImageRep(data: image.tiffRepresentation!)!
        let filename = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try representation.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(filename))
    }
}
