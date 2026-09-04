import React from "react";
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { glass, radii, shadow } from "../theme";

type GlassVariant = "real" | "tint";
type GlassTone = "light" | "accent";

type GlassShadowTier = "card" | "fab" | "none";

// Uniform radius (all four corners), or per-corner for shapes like the
// bottom sheet that only round their top edge.
type GlassRadius =
  | number
  | {
      topLeft?: number;
      topRight?: number;
      bottomLeft?: number;
      bottomRight?: number;
    };

type GlassSurfaceProps = {
  children?: React.ReactNode;
  variant?: GlassVariant;
  tone?: GlassTone;
  intensity?: number;
  radius?: GlassRadius;
  shadowTier?: GlassShadowTier;
  // More opaque tint for surfaces where legibility matters more than
  // see-through-ness (the bottom sheet, a pinned header over busy content).
  strong?: boolean;
  style?: ViewStyle | ViewStyle[];
  contentStyle?: ViewStyle | ViewStyle[];
} & Omit<ViewProps, "style">;

function resolveCornerStyle(radius: GlassRadius): ViewStyle {
  if (typeof radius === "number") {
    return { borderRadius: radius };
  }
  return {
    borderTopLeftRadius: radius.topLeft ?? 0,
    borderTopRightRadius: radius.topRight ?? 0,
    borderBottomLeftRadius: radius.bottomLeft ?? 0,
    borderBottomRightRadius: radius.bottomRight ?? 0,
  };
}

// Approximates iOS 26 "Liquid Glass" with RN primitives: a blurred/translucent
// base layer, a top-edge gradient sheen for curvature, and a hairline border
// for depth. Platform branching lives here so no consumer needs its own
// Platform.OS checks - see the plan in
// ~/.claude/plans/i-wanna-make-the-optimized-frost.md for why each surface
// picks "real" (BlurView, single/bounded-instance surfaces like the FAB or
// the bottom sheet) vs. "tint" (no BlurView, safe to repeat in a list).
export default function GlassSurface({
  children,
  variant = "tint",
  tone = "light",
  intensity,
  radius = radii.lg,
  shadowTier = "card",
  strong = false,
  style,
  contentStyle,
  ...rest
}: GlassSurfaceProps) {
  const tintColor =
    tone === "accent" ? glass.accentTint : strong ? glass.tintStrong : glass.tint;
  const shadowStyle = shadowTier === "none" ? undefined : shadow[shadowTier];
  const cornerStyle = resolveCornerStyle(radius);
  // react-native-web's BlurView support is inconsistent, so web always
  // falls back to the cheap translucent-color-only tier regardless of the
  // variant a caller asked for.
  const useRealBlur = variant === "real" && Platform.OS !== "web";
  const blurIntensity =
    intensity ?? (Platform.OS === "ios" ? glass.blurIntensity.ios : glass.blurIntensity.android);

  return (
    // Shadow lives on this outer view; overflow:hidden (needed to clip the
    // blur/gradient to the rounded corners below) would clip the shadow too
    // if they shared a view, so the clipped layer is a separate child.
    <View style={[cornerStyle, shadowStyle, style]} {...rest}>
      <View style={[styles.clip, cornerStyle]}>
        {useRealBlur ? (
          <BlurView
            intensity={blurIntensity}
            tint="light"
            blurMethod={Platform.OS === "android" ? "dimezisBlurView" : "none"}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tintColor }]} />
        <LinearGradient
          colors={[glass.sheenTop, glass.sheenBottom]}
          style={styles.sheen}
        />
        <View style={[StyleSheet.absoluteFill, styles.border, cornerStyle]} />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    overflow: "hidden",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    pointerEvents: "none",
  },
  border: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glass.border,
  },
  content: {
    // Layered above the blur/tint/sheen/border layers, which are all
    // position:absolute siblings preceding this one.
  },
});
