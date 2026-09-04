"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ClassComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Saved classes first, then subjects already used on assignments. May be empty. */
  options: string[];
  id?: string;
  placeholder?: string;
}

/**
 * Pick a class, or type one that does not exist yet.
 *
 * The subject field is free text in the database and stays that way; this only
 * makes the common case — a class the student takes every week — a click
 * instead of retyping "Mathematics" for the twentieth time.
 */
export function ClassCombobox({
  value,
  onValueChange,
  options,
  id,
  placeholder = "Select or type a class",
}: ClassComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const typed = search.trim();
  // Only offer to create what is not already on the list, so the student is
  // never shown 'Use "Physics"' directly above Physics.
  const showCreate = typed.length > 0 && !options.some((option) => option.toLowerCase() === typed.toLowerCase());

  const commit = (next: string) => {
    onValueChange(next);
    setSearch("");
    setOpen(false);
  };

  return (
    // `modal` keeps the list clickable inside the assignment dialog, which is
    // itself a modal and would otherwise swallow the pointer events.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or add a class..." value={search} onValueChange={setSearch} />
          <CommandList>
            {!showCreate && <CommandEmpty>No classes yet — start typing to add one.</CommandEmpty>}
            {options.length > 0 && (
              <CommandGroup>
                {options.map((option) => (
                  // cmdk lowercases the value it hands to onSelect, so commit
                  // the option from the closure to preserve its capitalisation.
                  <CommandItem key={option} value={option} onSelect={() => commit(option)}>
                    <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{option}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup>
                <CommandItem value={typed} onSelect={() => commit(typed)}>
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  <span className="truncate">
                    Use <span className="font-medium">"{typed}"</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
