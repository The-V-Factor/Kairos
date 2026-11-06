import SwiftUI
import UIKit

// UIKit provides native scrolling momentum; the fixed-size drawing keeps labels crisp while zooming.
struct DistanceRuler: UIViewRepresentable {
  var points: [FuelPoint] = []
  var selectedID: UUID?
  var theme: RideTheme
  var haptics: Bool
  var totalMeters: Double
  var zoomCommand = 0
  var editValue: Double?
  var onSelect: (UUID) -> Void = { _ in }
  var onBrowse: ((Double) -> Void)?
  var onEdit: ((Double) -> Void)?

  func makeUIView(context: Context) -> RulerView { RulerView() }
  func updateUIView(_ view: RulerView, context: Context) {
    view.configure(self)
  }
}

final class RulerView: UIView, UIScrollViewDelegate {
  private let scroll = UIScrollView()
  private let content = UIView()
  private let drawing = RulerDrawing()
  private let selection = UISelectionFeedbackGenerator()
  private let impact = UIImpactFeedbackGenerator(style: .soft)
  private var configuration: DistanceRuler?
  private var extent = 1000.0
  private var fitExtent = 1000.0
  private var zoom = 1.0
  private var pinchZoom = 1.0
  private var anchorMeters = 0.0
  private var applying = false
  private var initialized = false
  private var lastTick: Double?
  private var lastFeedback = 0.0
  private var previousCenter = 0.0
  private var displayLink: CADisplayLink?
  private var zoomTransition: (from: Double, to: Double, center: Double, start: Double)?
  private var wave = 0.0
  private var waveTarget = 0.0
  private var waveDirection = 0.0
  private var lastFrame = 0.0

  override init(frame: CGRect) {
    super.init(frame: frame)
    scroll.delegate = self
    scroll.showsHorizontalScrollIndicator = false
    scroll.alwaysBounceHorizontal = true
    scroll.isDirectionalLockEnabled = true
    scroll.decelerationRate = .normal
    scroll.addSubview(content)
    addSubview(scroll)
    drawing.isUserInteractionEnabled = false
    addSubview(drawing)
    scroll.addGestureRecognizer(
      UIPinchGestureRecognizer(target: self, action: #selector(pinch(_:))))
    scroll.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap(_:))))
    isAccessibilityElement = true
    accessibilityTraits = [.adjustable]
    accessibilityLabel = "距离尺"
    accessibilityHint = "左右滑动浏览，双指缩放。也可使用列表选择补给点。"
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  private var usableWidth: Double { max(1, Double(bounds.width) - 48) }
  private var scale: Double { usableWidth / fitExtent * zoom }
  private var centerMeters: Double { max(0, min(extent, Double(scroll.contentOffset.x) / scale)) }

  func configure(_ value: DistanceRuler) {
    let old = configuration
    let oldCenter = initialized ? centerMeters : nil
    configuration = value
    let total = value.totalMeters
    if !initialized {
      extent = max(1, total)
      fitExtent = extent
      zoom = 1
      position(at: oldCenter ?? extent / 2)
    } else if old?.totalMeters != total {
      extent = max(1, total)
      fitExtent = extent
      zoom = 1
      position(at: oldCenter ?? extent / 2)
    }
    if let old, old.zoomCommand != value.zoomCommand {
      let destination = min(64, max(1, zoom * (value.zoomCommand > old.zoomCommand ? 2 : 0.5)))
      if UIAccessibility.isReduceMotionEnabled {
        zoom = destination
        position(at: oldCenter ?? extent / 2)
      } else {
        zoomTransition = (zoom, destination, oldCenter ?? extent / 2, CACurrentMediaTime())
        startDisplayLink()
      }
    }
    if let edit = value.editValue, old?.editValue != edit, !scroll.isTracking,
      !scroll.isDecelerating
    {
      position(at: edit)
    } else if value.selectedID != old?.selectedID,
      let point = value.points.first(where: { $0.id == value.selectedID })
    {
      applying = true
      scroll.setContentOffset(
        CGPoint(x: point.cumulativeMeters * scale, y: 0),
        animated: !UIAccessibility.isReduceMotionEnabled)
      applying = false
    }
    initialized = bounds.width > 0
    updateDrawing()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard scroll.frame != bounds else {
      updateDrawing()
      return
    }
    let previousScale = max(1, Double(scroll.bounds.width) - 48) / fitExtent * zoom
    let center =
      initialized
      ? Double(scroll.contentOffset.x) / previousScale : configuration?.editValue ?? extent / 2
    applying = true
    scroll.frame = bounds
    drawing.frame = bounds
    position(at: center)
    applying = false
    initialized = true
    updateDrawing()
  }

  private func position(at meters: Double) {
    let wasApplying = applying
    applying = true
    let size = CGSize(
      width: extent * scale + Double(bounds.width), height: Double(bounds.height))
    content.frame = CGRect(origin: .zero, size: size)
    scroll.contentSize = size
    scroll.contentOffset = CGPoint(x: max(0, min(extent, meters)) * scale, y: 0)
    applying = wasApplying
  }

  @objc private func pinch(_ gesture: UIPinchGestureRecognizer) {
    guard let config = configuration else { return }
    let x = Double(gesture.location(in: self).x)
    if gesture.state == .began {
      zoomTransition = nil
      waveTarget = 0.7
      startDisplayLink()
      pinchZoom = zoom
      anchorMeters = (Double(scroll.contentOffset.x) + x - Double(bounds.width) / 2) / scale
      scroll.setContentOffset(scroll.contentOffset, animated: false)
    }
    if gesture.state == .began || gesture.state == .changed {
      let center = centerMeters
      zoom = min(64, max(1, pinchZoom * gesture.scale))
      position(at: center)
      applying = true
      scroll.contentOffset.x = min(
        max(0, anchorMeters * scale - x + Double(bounds.width) / 2), extent * scale)
      applying = false
      updateDrawing()
      publishBrowse()
    }
    if gesture.state == .ended {
      if config.haptics { selection.selectionChanged() }
      publishEdit()
    }
    if [.ended, .cancelled, .failed].contains(gesture.state) { waveTarget = 0 }
  }

  @objc private func tap(_ gesture: UITapGestureRecognizer) {
    guard let config = configuration else { return }
    let x = Double(gesture.location(in: self).x)
    let meters = max(
      0, min(extent, (Double(scroll.contentOffset.x) + x - Double(bounds.width) / 2) / scale))
    if config.onEdit != nil {
      position(at: meters)
      publishEdit()
    } else if let point = config.points.min(by: {
      abs($0.cumulativeMeters - meters) < abs($1.cumulativeMeters - meters)
    }),
      abs(point.cumulativeMeters - meters) * scale < 28
    {
      config.onSelect(point.id)
      if config.haptics { impact.impactOccurred(intensity: 0.55) }
    } else {
      position(at: meters)
    }
    publishBrowse()
    updateDrawing()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    zoomTransition = nil
    waveTarget = 1
    startDisplayLink()
    lastTick = nil
    previousCenter = centerMeters
    selection.prepare()
  }
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    updateDrawing()
    guard !applying else { return }
    publishBrowse()
    guard scroll.isDragging || scroll.isDecelerating else { return }
    let meters = centerMeters
    waveDirection = max(-1, min(1, scroll.panGestureRecognizer.velocity(in: self).x / 1000))
    let tick = floor(meters / drawing.step)
    let now = CACurrentMediaTime()
    let crossesPoint =
      configuration?.points.contains(where: {
        $0.cumulativeMeters > min(previousCenter, meters)
          && $0.cumulativeMeters <= max(previousCenter, meters)
      }) == true
    if configuration?.haptics == true, crossesPoint || tick != lastTick, now - lastFeedback > 0.055
    {
      if crossesPoint {
        impact.impactOccurred(intensity: 0.55)
      } else {
        selection.selectionChanged()
      }
      lastFeedback = now
    }
    previousCenter = meters
    lastTick = tick
    publishEdit()
  }
  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate { waveTarget = 0 }
  }
  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { waveTarget = 0 }
  private func startDisplayLink() {
    guard displayLink == nil, window != nil else { return }
    lastFrame = CACurrentMediaTime()
    let link = CADisplayLink(target: self, selector: #selector(advance(_:)))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }
  @objc private func advance(_ link: CADisplayLink) {
    let now = CACurrentMediaTime()
    let blend = min(1, (now - lastFrame) * 16)
    lastFrame = now
    wave += ((UIAccessibility.isReduceMotionEnabled ? 0 : waveTarget) - wave) * blend
    drawing.wave = wave
    drawing.waveDirection = waveDirection
    if let transition = zoomTransition {
      let progress = min(1, (now - transition.start) / 0.28)
      let ease = 1 - pow(1 - progress, 3)
      zoom = transition.from + (transition.to - transition.from) * ease
      position(at: transition.center)
      publishBrowse()
      if progress == 1 {
        zoomTransition = nil
      }
    }
    updateDrawing()
    if zoomTransition == nil, waveTarget == 0, wave < 0.005 {
      link.invalidate()
      displayLink = nil
    }
  }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      displayLink?.invalidate()
      displayLink = nil
      zoomTransition = nil
      wave = 0
      waveTarget = 0
    }
  }
  private func publishEdit() {
    guard !applying, let edit = configuration?.onEdit else { return }
    let meters = (centerMeters * 10).rounded() / 10
    edit(meters)
  }
  private func publishBrowse() { configuration?.onBrowse?(centerMeters) }
  private func updateDrawing() {
    guard let config = configuration else { return }
    drawing.theme = config.theme
    drawing.scale = scale
    drawing.offset = Double(scroll.contentOffset.x)
    drawing.extent = extent
    drawing.points = config.points
    drawing.cursorMeters =
      config.onEdit != nil && !scroll.isDragging && !scroll.isDecelerating
      ? config.editValue ?? centerMeters : centerMeters
    accessibilityHint =
      config.onEdit == nil
      ? "左右滑动浏览，双指缩放。也可使用列表选择补给点。"
      : "左右拨动修改该点距出发里程，双指缩放精细调整。也可直接输入数值。"
    accessibilityValue = rideDistance(drawing.cursorMeters)
    drawing.setNeedsDisplay()
  }
  override func accessibilityIncrement() { adjust(1) }
  override func accessibilityDecrement() { adjust(-1) }
  private func adjust(_ direction: Double) {
    position(at: centerMeters + direction * drawing.step)
    waveTarget = 0
    wave = UIAccessibility.isReduceMotionEnabled ? 0 : 0.6
    startDisplayLink()
    publishBrowse()
    publishEdit()
    updateDrawing()
  }
}

private final class RulerDrawing: UIView {
  var theme = RideTheme.trail
  var scale = 1.0
  var offset = 0.0
  var extent = 1000.0
  var cursorMeters = 0.0
  var points: [FuelPoint] = []
  var wave = 0.0
  var waveDirection = 0.0
  private var majorInterval: Double {
    RulerScale.majorInterval(visibleMeters: max(1, Double(bounds.width) - 48) / max(scale, 1e-300))
  }
  var step: Double { majorInterval / 10 }
  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    isOpaque = false
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext(), scale > 0 else { return }
    let middle = Double(bounds.width) / 2
    let y = Double(bounds.height) - 30
    let focusColor = theme.rulerFocus
    let endIndex = ceil(extent / step)
    let nearestIndex = min(max(0, (cursorMeters / step).rounded()), endIndex)
    let nearestMeters = min(nearestIndex * step, extent)
    let focusedIndex =
      abs(extent - cursorMeters) < abs(nearestMeters - cursorMeters)
      ? endIndex : nearestIndex
    let focusedX = middle + min(focusedIndex * step, extent) * scale - offset
    let endpointX = middle + extent * scale - offset
    let separateEndpoint = abs(extent / majorInterval - (extent / majorInterval).rounded()) > 1e-8
    let endpointVisible = endpointX >= 0 && endpointX <= Double(bounds.width)
    let value = rideDistance(cursorMeters) as NSString
    let valueAttributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedDigitSystemFont(ofSize: 15, weight: .semibold),
      .foregroundColor: focusColor,
    ]
    let valueSize = value.size(withAttributes: valueAttributes)
    let valueX = max(0, min(Double(bounds.width) - valueSize.width, focusedX - valueSize.width / 2))
    value.draw(at: CGPoint(x: valueX, y: 4), withAttributes: valueAttributes)
    let start = max(0, (offset - middle) / scale)
    let finish = min(extent, (offset + middle) / scale)
    let first = floor(start / step)
    let last = ceil(finish / step)
    ctx.setLineCap(.round)
    if last - first < 500 {
      for index in stride(from: first, through: last, by: 1) {
        let meters = min(index * step, extent)
        guard meters >= 0, index <= endIndex else { continue }
        let x = middle + meters * scale - offset
        // Highlight the actual scale mark; never overlay a separate pointer.
        let selected = index == focusedIndex
        let major = index.truncatingRemainder(dividingBy: 5) == 0
        let focus = max(0, 1 - abs(x - middle) / max(1, middle))
        let arc = pow(1 - focus, 2) * 5
        let wavePosition = (x - middle) / 44 - waveDirection * 0.35
        let ripple = exp(-wavePosition * wavePosition) * (0.6 + 0.4 * cos(wavePosition * 3))
        let height = selected ? 27.0 : (major ? 16.0 : 9.0) + ripple * wave * 6
        let color =
          selected
          ? focusColor
          : theme.foreground.withAlphaComponent((major ? 0.28 : 0.12) + focus * 0.15)
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(selected ? 3 : major ? 1.2 : 0.8)
        ctx.move(to: CGPoint(x: x, y: y + arc - height))
        ctx.addLine(to: CGPoint(x: x, y: y + arc))
        ctx.strokePath()
        if index.truncatingRemainder(dividingBy: 10) == 0 {
          if separateEndpoint,
            index == endIndex || (endpointVisible && abs(x - endpointX) < 55)
          {
            continue
          }
          drawLabel(meters, x: x, y: y + arc + 7)
        }
      }
    }
    if separateEndpoint, endpointVisible {
      let arc = pow(min(1, abs(endpointX - middle) / max(1, middle)), 2) * 5
      drawLabel(extent, x: endpointX, y: y + arc + 7, endpoint: true)
    }
    drawMarkers(in: ctx, middle: middle, baseline: y)
  }

  private func drawLabel(_ meters: Double, x: Double, y: Double, endpoint: Bool = false) {
    let useKilometers = majorInterval >= 1000
    let label =
      ((meters / (useKilometers ? 1000 : 1)).formatted(
        .number.precision(.fractionLength(endpoint ? 0...1 : 0...0)))
      + (useKilometers ? " km" : " m")) as NSString
    let attrs: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedDigitSystemFont(ofSize: 11, weight: .medium),
      .foregroundColor: theme.foreground.withAlphaComponent(0.8),
    ]
    let size = label.size(withAttributes: attrs)
    let labelX = max(0, min(Double(bounds.width) - size.width, x - size.width / 2))
    label.draw(at: CGPoint(x: labelX, y: y), withAttributes: attrs)
  }

  private func drawMarkers(in ctx: CGContext, middle: Double, baseline: Double) {
    let visible = points.filter {
      let x = middle + $0.cumulativeMeters * scale - offset
      return x >= 10 && x <= Double(bounds.width) - 10
    }
    var groups: [[FuelPoint]] = []
    for point in visible {
      if let last = groups.last?.last,
        (point.cumulativeMeters - last.cumulativeMeters) * scale < 26
      {
        groups[groups.count - 1].append(point)
      } else {
        groups.append([point])
      }
    }
    for group in groups {
      guard let first = group.first else { continue }
      let center = group.reduce(0.0) { $0 + $1.cumulativeMeters / Double(group.count) }
      let x = middle + center * scale - offset
      let color = theme.markerColor(first.kind)
      ctx.setStrokeColor(color.withAlphaComponent(0.45).cgColor)
      ctx.setLineWidth(1)
      ctx.move(to: CGPoint(x: x, y: baseline - 34))
      ctx.addLine(to: CGPoint(x: x, y: baseline - 29))
      ctx.strokePath()
      let rect = CGRect(x: x - 10, y: baseline - 56, width: 20, height: 20)
      if group.count > 1 {
        ctx.setFillColor(color.withAlphaComponent(0.15).cgColor)
        ctx.fillEllipse(in: rect)
        let text = "\(group.count)" as NSString
        let attrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 11, weight: .bold), .foregroundColor: color,
        ]
        let size = text.size(withAttributes: attrs)
        text.draw(
          at: CGPoint(x: x - size.width / 2, y: rect.midY - size.height / 2), withAttributes: attrs)
      } else if first.kind == .gel {
        let packet = UIBezierPath(roundedRect: rect.insetBy(dx: 4, dy: 1), cornerRadius: 2)
        color.setStroke()
        packet.lineWidth = 1.5
        packet.stroke()
        let word = "GEL" as NSString
        word.draw(
          at: CGPoint(x: x - 6, y: rect.midY - 3),
          withAttributes: [
            .font: UIFont.systemFont(ofSize: 5, weight: .bold), .foregroundColor: color,
          ])
      } else {
        let symbol =
          first.kind == .water
          ? "waterbottle" : "tag"
        UIImage(
          systemName: symbol,
          withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .medium))?
          .withTintColor(color, renderingMode: .alwaysOriginal).draw(in: rect)
      }
    }
  }
}
