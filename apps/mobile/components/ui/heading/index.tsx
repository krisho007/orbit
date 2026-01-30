"use client";

import React from "react";
import { Text, type TextProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

const headingStyle = tv({
  base: "text-typography-900 font-bold",
  variants: {
    size: {
      "5xl": "text-5xl leading-[56px]",
      "4xl": "text-4xl leading-[44px]",
      "3xl": "text-3xl leading-[38px]",
      "2xl": "text-2xl leading-[32px]",
      xl: "text-xl leading-[28px]",
      lg: "text-lg leading-[26px]",
      md: "text-base leading-[22px]",
      sm: "text-sm leading-[20px]",
      xs: "text-xs leading-[18px]",
    },
    isTruncated: {
      true: "",
      false: "",
    },
    bold: {
      true: "font-bold",
      false: "font-normal",
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
  },
  defaultVariants: {
    size: "lg",
    isTruncated: false,
    bold: true,
    underline: false,
    strikeThrough: false,
    highlight: false,
  },
});

export interface HeadingProps
  extends TextProps,
    VariantProps<typeof headingStyle> {
  className?: string;
  children?: React.ReactNode;
}

export function Heading({
  children,
  size,
  isTruncated,
  bold,
  underline,
  strikeThrough,
  highlight,
  className,
  numberOfLines,
  ...props
}: HeadingProps) {
  return (
    <Text
      className={headingStyle({
        size,
        isTruncated,
        bold,
        underline,
        strikeThrough,
        highlight,
        class: className,
      })}
      numberOfLines={isTruncated ? 1 : numberOfLines}
      {...props}
    >
      {children}
    </Text>
  );
}
