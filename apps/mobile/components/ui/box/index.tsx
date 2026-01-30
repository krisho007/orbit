"use client";

import React from "react";
import { View, type ViewProps } from "react-native";

export interface BoxProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
}

export function Box({ className, children, ...props }: BoxProps) {
  return (
    <View className={className} {...props}>
      {children}
    </View>
  );
}
