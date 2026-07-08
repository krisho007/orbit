"use client";

import React from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

const vstackStyle = tv({
  base: "flex-col",
  variants: {
    space: {
      none: "gap-0",
      "2xs": "gap-0.5",
      xs: "gap-1",
      sm: "gap-2",
      md: "gap-3",
      lg: "gap-4",
      xl: "gap-5",
      "2xl": "gap-6",
      "3xl": "gap-7",
      "4xl": "gap-8",
    },
    reversed: {
      true: "flex-col-reverse",
      false: "",
    },
  },
  defaultVariants: {
    space: "md",
    reversed: false,
  },
});

export interface VStackProps
  extends ViewProps,
    VariantProps<typeof vstackStyle> {
  className?: string;
  children?: React.ReactNode;
}

export function VStack({
  children,
  space,
  reversed,
  className,
  ...props
}: VStackProps) {
  return (
    <View className={vstackStyle({ space, reversed, class: className })} {...props}>
      {children}
    </View>
  );
}
