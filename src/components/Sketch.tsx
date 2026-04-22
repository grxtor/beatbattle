"use client";

import React from "react";
import styles from "./Sketch.module.css";

type SketchVariant = 1 | 2 | 3;

type SketchProps<T extends React.ElementType = "div"> = {
  as?: T;
  variant?: SketchVariant;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "className" | "children">;

export default function Sketch<T extends React.ElementType = "div">({
  as,
  variant = 1,
  className = "",
  children,
  ...rest
}: SketchProps<T>) {
  const Tag = (as || "div") as React.ElementType;
  const variantCls =
    variant === 2 ? styles.v2 : variant === 3 ? styles.v3 : "";
  const cls = [styles.sketch, variantCls, className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
