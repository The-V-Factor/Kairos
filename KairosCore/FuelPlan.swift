import Foundation

enum FuelKind: String, Codable, CaseIterable, Identifiable {
  case water, gel, custom
  var id: String { rawValue }
  var title: String {
    switch self {
    case .water: "水"
    case .gel: "能量胶"
    case .custom: "自定义"
    }
  }

  var defaultReminder: String {
    switch self {
    case .water: "喝水"
    case .gel: "吃胶"
    case .custom: ""
    }
  }

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer()
    let raw = try value.decode(String.self)
    guard let kind = Self(rawValue: raw == "other" ? "custom" : raw) else {
      throw DecodingError.dataCorruptedError(in: value, debugDescription: "Unknown fuel kind")
    }
    self = kind
  }
}

struct FuelStop: Codable, Equatable, Identifiable {
  var id = UUID()
  // Meters since the start of the ride, independent of every other stop.
  var distance = ""
  var reminder = ""
  var kind: FuelKind = .custom
  var name = ""
  var legacyDistance: String?

  var displayName: String { kind == .custom ? name : kind.title }

  private enum CodingKeys: String, CodingKey {
    case id, distance, reminder, kind, name, legacyDistance
  }

  init(
    id: UUID = UUID(), distance: String = "", reminder: String = "", kind: FuelKind = .custom,
    name: String? = nil
  ) {
    self.id = id
    self.distance = distance
    self.reminder = reminder
    self.kind = kind
    self.name = name ?? (kind == .custom ? "补给" : "")
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(UUID.self, forKey: .id)
    distance = try values.decode(String.self, forKey: .distance)
    reminder = try values.decode(String.self, forKey: .reminder)
    let rawKind = try values.decodeIfPresent(String.self, forKey: .kind)
    kind = try values.decodeIfPresent(FuelKind.self, forKey: .kind) ?? .custom
    name = try values.decodeIfPresent(String.self, forKey: .name) ?? ""
    if rawKind == nil || rawKind == "other",
      name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      name = "补给"
    }
    legacyDistance = try values.decodeIfPresent(String.self, forKey: .legacyDistance)
  }
}

struct FuelPoint: Equatable, Identifiable {
  let id: UUID
  let cumulativeMeters: Double
  let reminder: String
  let kind: FuelKind
}

struct FuelPlan: Codable, Equatable {
  var id = UUID()
  var totalDistance = ""
  var stops: [FuelStop] = []

  private enum CodingKeys: String, CodingKey { case id, totalDistance, stops, segments }

  init(id: UUID = UUID(), totalDistance: String = "", stops: [FuelStop] = []) {
    self.id = id
    self.totalDistance = totalDistance
    self.stops = stops
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(UUID.self, forKey: .id)
    totalDistance = try values.decodeIfPresent(String.self, forKey: .totalDistance) ?? ""
    if values.contains(.stops) {
      stops = try values.decode([FuelStop].self, forKey: .stops)
    } else {
      // Old drafts stored interval lengths. Preserve their positions and identities once.
      var cumulative = 0.0
      var knownPosition = true
      stops = try values.decode([FuelStop].self, forKey: .segments).map { original in
        var stop = original
        if knownPosition, let meters = Self.meters(original.distance),
          (cumulative + meters).isFinite
        {
          cumulative += meters
          stop.distance = cumulative.formatted(
            .number.locale(Locale(identifier: "en_US_POSIX")).grouping(.never)
              .precision(.significantDigits(1...15)))
        } else {
          knownPosition = false
          stop.legacyDistance = original.distance
          stop.distance = ""
        }
        return stop
      }
      // The final reminder does not tell us the intended ride length. Ask the user to set it.
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(id, forKey: .id)
    try values.encode(totalDistance, forKey: .totalDistance)
    try values.encode(stops, forKey: .stops)
  }

  static func meters(_ text: String, locale: Locale = .current, allowZero: Bool = false) -> Double?
  {
    let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: locale.decimalSeparator ?? ".", with: ".")
    guard !normalized.isEmpty, normalized.allSatisfy({ "0123456789.".contains($0) }),
      let value = Double(normalized), value.isFinite, value > 0 || (allowZero && value == 0)
    else { return nil }
    return value
  }

  var orderedStops: [FuelStop] {
    stops.sorted {
      (Self.meters($0.distance, allowZero: true) ?? .infinity)
        < (Self.meters($1.distance, allowZero: true) ?? .infinity)
    }
  }

  func normalized(locale: Locale = .current) throws -> FuelPlan {
    _ = try points(locale: locale)
    var result = self
    result.totalDistance = PlanDistance.stored(Self.meters(totalDistance, locale: locale)!)
    result.stops = stops.map { stop in
      var copy = stop
      copy.distance = PlanDistance.stored(
        Self.meters(stop.distance, locale: locale, allowZero: true)!)
      return copy
    }
    return result
  }

  func validateStop(_ stop: FuelStop, locale: Locale = .current) throws {
    _ = try FuelPlan(totalDistance: totalDistance, stops: [stop]).points(locale: locale)
    let position = Self.meters(stop.distance, locale: locale, allowZero: true).map(
      PlanDistance.roundedMeters)
    if stops.contains(where: {
      $0.id != stop.id
        && Self.meters($0.distance, locale: locale, allowZero: true).map(PlanDistance.roundedMeters)
          == position
    }) {
      throw PlanError.duplicateDistance
    }
  }

  func points(locale: Locale = .current) throws -> [FuelPoint] {
    guard let rawTotal = Self.meters(totalDistance, locale: locale),
      case let total = PlanDistance.roundedMeters(rawTotal), total.isFinite, total > 0
    else {
      throw PlanError.invalidTotalDistance
    }
    guard !stops.isEmpty else { throw PlanError.emptyPlan }
    let ordered = stops.sorted {
      (Self.meters($0.distance, locale: locale, allowZero: true) ?? .infinity)
        < (Self.meters($1.distance, locale: locale, allowZero: true) ?? .infinity)
    }
    let points = try ordered.enumerated().map { index, segment in
      guard let rawMeters = Self.meters(segment.distance, locale: locale, allowZero: true),
        case let meters = PlanDistance.roundedMeters(rawMeters), meters.isFinite
      else {
        throw PlanError.invalidDistance(index + 1)
      }
      guard meters <= total else { throw PlanError.beyondPlan(index + 1) }
      let reminder = segment.reminder.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !reminder.isEmpty else { throw PlanError.emptyReminder(index + 1) }
      if segment.kind == .custom,
        segment.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        throw PlanError.emptyName(index + 1)
      }
      return FuelPoint(
        id: segment.id, cumulativeMeters: meters, reminder: reminder, kind: segment.kind)
    }
    for pair in zip(points, points.dropFirst())
    where pair.0.cumulativeMeters == pair.1.cumulativeMeters {
      throw PlanError.duplicateDistance
    }
    return points
  }
}

enum PlanError: LocalizedError, Equatable {
  case emptyPlan
  case invalidTotalDistance
  case invalidDistance(Int)
  case emptyReminder(Int)
  case emptyName(Int)
  case beyondPlan(Int)
  case duplicateDistance

  var errorDescription: String? {
    switch self {
    case .emptyPlan: "请至少添加一个补给点。"
    case .invalidTotalDistance: "请先设置这次骑行的计划距离。"
    case .invalidDistance(let index): "第 \(index) 个补给点：请输入不小于 0 的距出发里程，不要使用千位分隔符。"
    case .emptyReminder(let index): "第 \(index) 个补给点：请填写到点提示。"
    case .emptyName(let index): "第 \(index) 个补给点：请填写自定义补给名称。"
    case .beyondPlan(let index): "第 \(index) 个补给点：位置超出计划距离，请调整位置或增加计划距离。"
    case .duplicateDistance: "同一里程请合并为一个补给点，可在提醒中填写多项补给。"
    }
  }
}
