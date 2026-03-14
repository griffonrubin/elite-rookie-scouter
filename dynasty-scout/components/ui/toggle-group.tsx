"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const ToggleGroupContext = React.createContext<{
    value: string | string[]
    onValueChange: (value: any) => void
    type: "single" | "multiple"
}>({
    value: "",
    onValueChange: () => { },
    type: "single",
})

const ToggleGroup = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
        type: "single" | "multiple"
        value: string | string[]
        onValueChange: (value: any) => void
    }
>(({ className, type, value, onValueChange, children, ...props }, ref) => (
    <ToggleGroupContext.Provider value={{ value, onValueChange, type }}>
        <div
            ref={ref}
            className={cn("flex items-center justify-center gap-1", className)}
            {...props}
        >
            {children}
        </div>
    </ToggleGroupContext.Provider>
))
ToggleGroup.displayName = "ToggleGroup"

const ToggleGroupItem = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
        value: string
    }
>(({ className, children, value, ...props }, ref) => {
    const context = React.useContext(ToggleGroupContext)
    const isSelected = Array.isArray(context.value)
        ? context.value.includes(value)
        : context.value === value

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        props.onClick?.(e)
        if (context.type === "single") {
            context.onValueChange(value)
        } else {
            // Multi logic omitted for simplicity as we only need single
            context.onValueChange(value)
        }
    }

    return (
        <button
            ref={ref}
            type="button"
            onClick={handleClick}
            data-state={isSelected ? "on" : "off"}
            className={cn(
                "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground p-2",
                className
            )}
            {...props}
        >
            {children}
        </button>
    )
})
ToggleGroupItem.displayName = "ToggleGroupItem"

export { ToggleGroup, ToggleGroupItem }
