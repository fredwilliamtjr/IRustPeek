import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let build = root.appendingPathComponent("build", isDirectory: true)
let iconset = build.appendingPathComponent("icon.iconset", isDirectory: true)

try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

func drawIcon(size: Int) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    let rect = NSRect(x: 0, y: 0, width: size, height: size)
    NSColor(red: 0.067, green: 0.094, blue: 0.153, alpha: 1).setFill()
    NSBezierPath(roundedRect: rect, xRadius: CGFloat(size) * 0.22, yRadius: CGFloat(size) * 0.22).fill()

    let screen = NSRect(
        x: CGFloat(size) * 0.20,
        y: CGFloat(size) * 0.31,
        width: CGFloat(size) * 0.60,
        height: CGFloat(size) * 0.38
    )
    NSColor(red: 0.220, green: 0.741, blue: 0.973, alpha: 1).setFill()
    NSBezierPath(roundedRect: screen, xRadius: CGFloat(size) * 0.06, yRadius: CGFloat(size) * 0.06).fill()

    let stroke = NSBezierPath()
    stroke.lineWidth = max(4, CGFloat(size) * 0.07)
    stroke.lineCapStyle = .round
    stroke.lineJoinStyle = .round
    NSColor(red: 0.059, green: 0.090, blue: 0.165, alpha: 1).setStroke()

    stroke.move(to: NSPoint(x: CGFloat(size) * 0.34, y: CGFloat(size) * 0.50))
    stroke.line(to: NSPoint(x: CGFloat(size) * 0.65, y: CGFloat(size) * 0.50))
    stroke.move(to: NSPoint(x: CGFloat(size) * 0.53, y: CGFloat(size) * 0.39))
    stroke.line(to: NSPoint(x: CGFloat(size) * 0.65, y: CGFloat(size) * 0.50))
    stroke.line(to: NSPoint(x: CGFloat(size) * 0.53, y: CGFloat(size) * 0.61))
    stroke.stroke()

    image.unlockFocus()
    return image
}

func writePNG(_ image: NSImage, to url: URL) throws {
    guard
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let data = bitmap.representation(using: .png, properties: [:])
    else {
        throw NSError(domain: "IRustPeekIcon", code: 1)
    }
    try data.write(to: url)
}

func drawTrayTemplate(size: Int) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    let color = NSColor.black
    color.setStroke()

    let screen = NSRect(
        x: CGFloat(size) * 0.12,
        y: CGFloat(size) * 0.24,
        width: CGFloat(size) * 0.76,
        height: CGFloat(size) * 0.50
    )
    let screenPath = NSBezierPath(roundedRect: screen, xRadius: CGFloat(size) * 0.07, yRadius: CGFloat(size) * 0.07)
    screenPath.lineWidth = max(2, CGFloat(size) * 0.085)
    screenPath.stroke()

    let stand = NSBezierPath()
    stand.lineWidth = max(2, CGFloat(size) * 0.085)
    stand.lineCapStyle = .round
    stand.move(to: NSPoint(x: CGFloat(size) * 0.50, y: CGFloat(size) * 0.24))
    stand.line(to: NSPoint(x: CGFloat(size) * 0.50, y: CGFloat(size) * 0.12))
    stand.move(to: NSPoint(x: CGFloat(size) * 0.34, y: CGFloat(size) * 0.12))
    stand.line(to: NSPoint(x: CGFloat(size) * 0.66, y: CGFloat(size) * 0.12))
    stand.stroke()

    let stroke = NSBezierPath()
    stroke.lineWidth = max(2, CGFloat(size) * 0.075)
    stroke.lineCapStyle = .round
    stroke.lineJoinStyle = .round
    stroke.move(to: NSPoint(x: CGFloat(size) * 0.34, y: CGFloat(size) * 0.49))
    stroke.line(to: NSPoint(x: CGFloat(size) * 0.64, y: CGFloat(size) * 0.49))
    stroke.move(to: NSPoint(x: CGFloat(size) * 0.53, y: CGFloat(size) * 0.37))
    stroke.line(to: NSPoint(x: CGFloat(size) * 0.64, y: CGFloat(size) * 0.49))
    stroke.line(to: NSPoint(x: CGFloat(size) * 0.53, y: CGFloat(size) * 0.61))
    stroke.stroke()

    image.unlockFocus()
    return image
}

let variants: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (name, size) in variants {
    try writePNG(drawIcon(size: size), to: iconset.appendingPathComponent(name))
}

try writePNG(drawIcon(size: 512), to: build.appendingPathComponent("icon.png"))
try writePNG(drawTrayTemplate(size: 64), to: build.appendingPathComponent("trayTemplate.png"))

let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", build.appendingPathComponent("icon.icns").path]
try process.run()
process.waitUntilExit()

if process.terminationStatus != 0 {
    throw NSError(domain: "IRustPeekIcon", code: Int(process.terminationStatus))
}

print("Generated build/icon.icns")
