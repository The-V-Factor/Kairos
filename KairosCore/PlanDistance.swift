import Foundation

enum PlanDistance {
  static func roundedMeters(_ meters: Double) -> Double {
    let unit = meters >= 1000 ? 1000.0 : 1.0
    return (meters / unit * 10).rounded() / 10 * unit
  }

  static func stored(_ meters: Double) -> String {
    roundedMeters(meters).formatted(
      .number.locale(Locale(identifier: "en_US_POSIX")).grouping(.never)
        .precision(.fractionLength(0...1)))
  }

  static func label(_ meters: Double, locale: Locale = .current, compact: Bool = false) -> String {
    let value = roundedMeters(meters)
    let kilometers = value >= 1000
    let number = (kilometers ? value / 1000 : value).formatted(
      .number.locale(locale).grouping(.never).precision(.fractionLength(1)))
    return number + (compact ? "" : " ") + (kilometers ? "km" : "m")
  }
}
