import SwiftUI

// Each preview uses the same sample plan, with the theme's actual type, illustration and objects.
struct ThemeThumbnail: View {
  let theme: RideTheme

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("KAIROS").tracking(2)
        Spacer()
        Text(theme.letter)
      }.font(.system(size: 9, weight: .bold, design: theme.fontDesign))
      Text(theme == .journal ? "补给路书" : "骑行补给")
        .font(.system(size: theme == .pocket ? 24 : 20, weight: .bold, design: theme.fontDesign))
        .overlay(alignment: .leading) {
          if theme == .journal { Rectangle().fill(theme.accent).frame(width: 3).offset(x: -7) }
        }
      switch theme {
      case .trail:
        TrailArtwork(theme: theme)
      case .rhythm:
        HStack(alignment: .firstTextBaseline) {
          Text("100").font(.system(size: 40, weight: .black)).fontWidth(.condensed)
          Text("km").font(.system(size: 12))
          Spacer()
          Text("READY\nTO RIDE").font(.system(size: 8, weight: .medium)).tracking(2)
        }.foregroundStyle(theme.accent)
        miniatureDial
      case .journal:
        HStack {
          Text("ROUTE NOTES").tracking(2)
          Spacer()
          Text("3 STOPS")
        }.font(.system(size: 8, design: .serif)).foregroundStyle(theme.accent)
      case .pocket:
        HStack(spacing: 28) {
          ForEach(Array([FuelKind.gel, .water, .gel].enumerated()), id: \.offset) { _, kind in
            FuelToken(kind: kind, theme: theme)
              .rotationEffect(.degrees(kind == .water ? 9 : -9))
          }
        }.frame(maxWidth: .infinity).frame(height: 65)
      case .precision:
        HStack(alignment: .firstTextBaseline) {
          Text("3").font(.system(size: 26, weight: .medium))
          Text("补给点").font(.system(size: 9))
          Spacer()
          Text("100 km").font(.system(size: 23, weight: .semibold)).foregroundStyle(theme.accent)
        }
        miniatureDial
      }
      ForEach(Array(["25", "45", "70"].enumerated()), id: \.offset) { index, distance in
        HStack(spacing: 9) {
          if theme == .journal {
            Text("0\(index + 1)").font(.system(size: 9)).foregroundStyle(theme.detail)
          }
          Text(distance).font(
            .system(size: theme == .journal ? 27 : 17, weight: .semibold, design: theme.fontDesign)
          )
          .foregroundStyle(theme.accent).frame(width: 37, alignment: .leading)
          VStack(alignment: .leading, spacing: 2) {
            Text(index == 1 ? "喝水" : "吃一包胶").font(.system(size: 10, weight: .medium))
            Text("距出发 \(distance) km").font(.system(size: 7)).foregroundStyle(
              theme.muted)
          }
          Spacer(minLength: 0)
        }
        .frame(height: theme == .journal ? 35 : 28)
        .padding(.horizontal, theme == .trail || theme == .pocket ? 8 : 0)
        .background {
          if theme == .trail || theme == .pocket {
            RoundedRectangle(cornerRadius: 10).fill(theme.surface)
          }
        }
        .overlay(alignment: .bottom) {
          if theme != .trail && theme != .pocket { theme.line.frame(height: 0.5) }
        }
      }
      Spacer(minLength: 0)
      Text("发送到 Apple Watch").font(.system(size: 9, weight: .semibold))
        .frame(maxWidth: .infinity).padding(.vertical, 8)
        .foregroundStyle(theme.onAccent).background(
          theme.accent, in: RoundedRectangle(cornerRadius: theme.radius / 2))
    }
    .padding(14)
    .frame(width: 220, height: 310, alignment: .topLeading)
    .foregroundStyle(theme.ink).background(theme.canvas)
    .scaleEffect(0.5, anchor: .topLeading)
    .frame(width: 110, height: 155, alignment: .topLeading)
    .clipped().clipShape(RoundedRectangle(cornerRadius: 12))
    .allowsHitTesting(false).accessibilityHidden(true)
  }

  private var miniatureDial: some View {
    Canvas { context, size in
      for index in 0...30 {
        let x = size.width * CGFloat(index) / 30
        var tick = Path()
        tick.move(to: CGPoint(x: x, y: index % 5 == 0 ? 3 : 11))
        tick.addLine(to: CGPoint(x: x, y: 25))
        context.stroke(
          tick, with: .color(theme.ink.opacity(index % 5 == 0 ? 0.7 : 0.3)), lineWidth: 1)
      }
      var needle = Path()
      needle.move(to: CGPoint(x: size.width / 2, y: 0))
      needle.addLine(to: CGPoint(x: size.width / 2, y: 28))
      context.stroke(needle, with: .color(theme.accent), lineWidth: 3)
    }.frame(height: 29)
  }
}
