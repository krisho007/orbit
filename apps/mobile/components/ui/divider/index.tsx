"use client";

import React from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

const dividerStyle = tv({
  base: "bg-border-200",
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "w-px h-full",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export interface DividerProps
  extends ViewProps,
    VariantProps<typeof dividerStyle> {
  className?: string;
}

export function Divider({ orientation, className, ...props }: DividerProps) {
  return (
    <View className={dividerStyle({ orientation, class: className })} {...props} />
  );
}
