import SwiftUI
import UIKit

enum RideTheme: String, CaseIterable, Identifiable {
  case trail, rhythm, journal, pocket, precision
  var id: String { rawValue }
  var title: String {
    switch self {
    case .trail: "沿途"
    case .rhythm: "节奏"
    case .journal: "路书"
    case .pocket: "口袋补给"
    case .precision: "精密刻度"
    }
  }
  var caption: String {
    switch self {
    case .trail: "暖纸、森林绿与沿途插画"
    case .rhythm: "深色仪表与鲜明运动刻度"
    case .journal: "蓝色墨迹与路书排版"
    case .pocket: "明亮色块与补给物件"
    case .precision: "浅色仪器与精确对齐"
    }
  }
  var letter: String { ["A", "B", "C", "D", "E"][Self.allCases.firstIndex(of: self)!] }
  var canvas: Color { Color(uiColor: background) }
  var background: UIColor { color([0xFAF5E9, 0x141614, 0xFAF8F2, 0xFFF0A1, 0xF5F7F8]) }
  var ink: Color { Color(uiColor: foreground) }
  var foreground: UIColor { color([0x244B33, 0xF7F8EB, 0x191F2C, 0x401332, 0x20272D]) }
  var accent: Color { Color(uiColor: accentUIColor) }
  var accentUIColor: UIColor { color([0x2D5C3E, 0xE4F735, 0x173DB5, 0x52143E, 0xD82D1D]) }
  var rulerFocus: UIColor { color([0x167744, 0xE4F735, 0x1856DC, 0xA21C63, 0xD82D1D]) }
  func markerColor(_ kind: FuelKind) -> UIColor {
    guard self == .rhythm else { return rulerFocus }
    switch kind {
    case .water: return UIColor(red: 0.47, green: 0.94, blue: 0.81, alpha: 1)
    case .gel: return UIColor(red: 1, green: 0.67, blue: 0.32, alpha: 1)
    case .custom: return foreground
    }
  }
  var detail: Color { colorValue([0x9C4B15, 0xE4F735, 0xB93631, 0xB5301E, 0xD82D1D]) }
  var muted: Color { ink.opacity(self == .rhythm ? 0.73 : 0.72) }
  var surface: Color { colorValue([0xFFFCF3, 0x212420, 0xFFFFFF, 0xFFF8DC, 0xFFFFFF]) }
  var onAccent: Color { self == .rhythm ? Color.black : Color.white }
  var line: Color { ink.opacity(self == .journal ? 0.28 : 0.14) }
  var radius: CGFloat { self == .journal ? 5 : (self == .precision ? 12 : 22) }
  var fontDesign: Font.Design {
    self == .journal ? .serif : (self == .trail || self == .pocket ? .rounded : .default)
  }
  var motion: Animation {
    .spring(response: self == .pocket ? 0.45 : 0.32, dampingFraction: self == .pocket ? 0.68 : 0.88)
  }

  private func color(_ hexes: [UInt32]) -> UIColor {
    let hex = hexes[Self.allCases.firstIndex(of: self)!]
    return UIColor(
      red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
      blue: CGFloat(hex & 255) / 255, alpha: 1)
  }
  private func colorValue(_ hexes: [UInt32]) -> Color { Color(uiColor: color(hexes)) }
}

func rideDistance(_ meters: Double) -> String {
  PlanDistance.label(meters)
}

func distanceNumber(_ meters: Double) -> String {
  meters.formatted(
    .number.grouping(.never).precision(.significantDigits(1...15)).locale(
      Locale(identifier: "en_US_POSIX")))
}
