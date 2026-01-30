"use client";

import React from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

const cardStyle = tv({
  base: "rounded-xl bg-background-0 border border-border-200",
  variants: {
    size: {
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
    variant: {
      elevated: "shadow-lg border-transparent",
      outline: "shadow-none",
      ghost: "bg-transparent border-transparent",
      filled: "bg-background-50 border-transparent",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "elevated",
  },
});

export interface CardProps
  extends ViewProps,
    VariantProps<typeof cardStyle> {
  className?: string;
  children?: React.ReactNode;
}

export function Card({
  children,
  size,
  variant,
  className,
  ...props
}: CardProps) {
  return (
    <View className={cardStyle({ size, variant, class: className })} {...props}>
      {children}
    </View>
  );
}
