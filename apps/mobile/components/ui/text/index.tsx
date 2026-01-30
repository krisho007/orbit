"use client";

import React from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

const textStyle = tv({
  base: "text-typography-900",
  variants: {
    size: {
      "2xs": "text-[10px] leading-[14px]",
      xs: "text-xs leading-4",
      sm: "text-sm leading-5",
      md: "text-base leading-6",
      lg: "text-lg leading-7",
      xl: "text-xl leading-7",
      "2xl": "text-2xl leading-8",
      "3xl": "text-3xl leading-9",
      "4xl": "text-4xl leading-10",
      "5xl": "text-5xl leading-[1]",
      "6xl": "text-6xl leading-[1]",
    },
    bold: {
      true: "font-bold",
      false: "",
    },
    italic: {
      true: "italic",
      false: "",
    },
    underline: {
      true: "underline",
      false: "",
    },
    strikeThrough: {
      true: "line-through",
      false: "",
    },
    highlight: {
      true: "bg-yellow-200",
      false: "",
    },
    isTruncated: {
      true: "",
      false: "",
    },
    sub: {
      true: "text-xs",
      false: "",
    },
  },
  defaultVariants: {
    size: "md",
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    highlight: false,
    isTruncated: false,
    sub: false,
  },
});

export interface TextProps
  extends RNTextProps,
    VariantProps<typeof textStyle> {
  className?: string;
  children?: React.ReactNode;
}

export function Text({
  children,
  size,
  bold,
  italic,
  underline,
  strikeThrough,
  highlight,
  isTruncated,
  sub,
  className,
  numberOfLines,
  ...props
}: TextProps) {
  return (
    <RNText
      className={textStyle({
        size,
        bold,
        italic,
        underline,
        strikeThrough,
        highlight,
        isTruncated,
        sub,
        class: className,
      })}
      numberOfLines={isTruncated ? 1 : numberOfLines}
      {...props}
    >
      {children}
    </RNText>
  );
}
