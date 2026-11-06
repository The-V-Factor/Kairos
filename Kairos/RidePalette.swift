import SwiftUI
import UIKit

enum RidePalette {
  static let canvas = adaptive(light: 0xF5F5EF, dark: 0x121B16)
  static let surface = adaptive(light: 0xFFFFFF, dark: 0x1C2821)
  static let inset = adaptive(light: 0xF2F5EE, dark: 0x26352B)
  static let accent = adaptive(light: 0x2D5B46, dark: 0xC1DBAD)
  static let onAccent = adaptive(light: 0xFFFFFF, dark: 0x17251A)
  static let softAccent = adaptive(light: 0xE8EEDF, dark: 0x2A3B2C)
  static let muted = adaptive(light: 0x59685C, dark: 0xA9BAAC)
  static let warning = adaptive(light: 0x95502D, dark: 0xF2B088)

  private static func adaptive(light: UInt32, dark: UInt32) -> Color {
    Color(
      uiColor: UIColor { traits in
        let hex = traits.userInterfaceStyle == .dark ? dark : light
        return UIColor(
          red: CGFloat((hex >> 16) & 0xFF) / 255,
          green: CGFloat((hex >> 8) & 0xFF) / 255,
          blue: CGFloat(hex & 0xFF) / 255,
          alpha: 1
        )
      })
  }
}
