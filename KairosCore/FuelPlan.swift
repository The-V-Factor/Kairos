import Foundation

struct FuelSegment: Codable, Equatable, Identifiable {
  var id = UUID()
  var distance = ""
  var reminder = ""
}

struct FuelPoint: Equatable, Identifiable {
  let id: UUID
  let distanceMeters: Double
  let cumulativeMeters: Double
  let reminder: String
}

struct FuelPlan: Codable, Equatable {
  var id = UUID()
  var segments = [FuelSegment()]

  func points(locale: Locale = .current) throws -> [FuelPoint] {
    guard !segments.isEmpty else { throw PlanError.emptyPlan }
    var cumulative = 0.0
    return try segments.enumerated().map { index, segment in
      let text = segment.distance.trimmingCharacters(in: .whitespacesAndNewlines)
      let normalized = text.replacingOccurrences(of: locale.decimalSeparator ?? ".", with: ".")
      guard !normalized.isEmpty,
        normalized.allSatisfy({ "0123456789.".contains($0) }),
        let meters = Double(normalized), meters.isFinite, meters > 0
      else {
        throw PlanError.invalidDistance(index + 1)
      }
      cumulative += meters
      guard cumulative.isFinite else { throw PlanError.distanceOverflow }
      let reminder = segment.reminder.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !reminder.isEmpty else { throw PlanError.emptyReminder(index + 1) }
      return FuelPoint(
        id: segment.id, distanceMeters: meters,
        cumulativeMeters: cumulative, reminder: reminder)
    }
  }
}

enum PlanError: LocalizedError, Equatable {
  case emptyPlan
  case invalidDistance(Int)
  case emptyReminder(Int)
  case distanceOverflow

  var errorDescription: String? {
    switch self {
    case .emptyPlan: "请至少添加一段骑行。"
    case .invalidDistance(let index): "第 \(index) 段：请输入大于 0 的距离（米），不要使用千位分隔符。"
    case .emptyReminder(let index): "第 \(index) 段：请填写到点提示。"
    case .distanceOverflow: "累计距离过大，请减小分段距离。"
    }
  }
}
