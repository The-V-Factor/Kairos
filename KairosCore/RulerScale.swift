import Foundation

enum RulerScale {
  // About four labeled intervals, using whole-meter 1/2/5 steps and their decimal multiples.
  static func majorInterval(visibleMeters: Double) -> Double {
    guard visibleMeters.isFinite, visibleMeters > 0 else { return 1 }
    let target = max(1, visibleMeters / 4)
    let magnitude = pow(10, floor(log10(target)))
    let fraction = target / magnitude
    let factor = fraction < 1.5 ? 1.0 : fraction < 2.5 ? 2.0 : fraction < 7.5 ? 5.0 : 10.0
    let result = factor * magnitude
    return result.isFinite ? result : magnitude
  }
}
