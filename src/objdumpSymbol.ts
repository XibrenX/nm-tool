import { KeyedSortedSet } from "./KeyedSortedSet";
import { NmSymbol } from "./nmSymbol";
import { ObjdumpInstruction } from "./objdumpInstruction";
import { ObjdumpSection } from "./objdumpSection";

export class ObjdumpSymbol {
  public instructions = new KeyedSortedSet<number, ObjdumpInstruction>(i => i.address);

  public get addressStr() { return this.address.toString(16); }

  public get location() { return this.nmSymbol?.location ?? this.instructions.at(0)?.location; }

  public nmSymbol?: NmSymbol;

  constructor(public readonly address: number, public readonly name: string, public readonly size: number, public readonly flags: ObjdumpLabelFlags, public readonly section: ObjdumpSection) { }

  public contains(address: number) {
    return address >= this.address && address < this.address + this.size;
  }

  public instructionFromAddress(address: number): ObjdumpInstruction | undefined {
    if (this.contains(address)) {
      const search = this.instructions.binarySearch(address);
      if (search.item)
        return search.item;
      if (search.index > 0 && this.instructions.length >= search.index) {
        const previous = this.instructions.at(search.index - 1);
        if (previous?.address === address) {
          return previous;
        }
      }
    }
  }
}

export class ObjdumpLabelFlags {
  constructor(
    public readonly binding: SymbolBindingFlag,
    public readonly strength: SymbolStrengthFlag,
    public readonly constructorFlag: SymbolConstructorFlag,
    public readonly warning: SymbolWarningFlag,
    public readonly indirection: SymbolIndirectionFlag,
    public readonly debugDynamic: SymbolDebugDynamicFlag,
    public readonly kind: SymbolKindFlag
  ) { }
}

export enum SymbolBindingFlag {
  Local = "l",
  Global = "g",
  UniqueGlobal = "u",
  None = " ",
  LocalAndGlobal = "!",
}

export enum SymbolStrengthFlag {
  Weak = "w",
  Strong = " ",
}

export enum SymbolConstructorFlag {
  Constructor = "C",
  Ordinary = " ",
}

export enum SymbolWarningFlag {
  Warning = "W",
  Normal = " ",
}

export enum SymbolIndirectionFlag {
  IndirectReference = "I",
  RelocEvaluatedFunction = "i",
  Normal = " ",
}

export enum SymbolDebugDynamicFlag {
  Debugging = "d",
  Dynamic = "D",
  Normal = " ",
}

export enum SymbolKindFlag {
  Function = "F",
  File = "f",
  Object = "O",
  Normal = " ",
}