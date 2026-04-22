import { KeyedSortedSet } from "./KeyedSortedSet";
import { NmRun } from "./nmRun";
import { ObjdumpSymbol } from "./objdumpSymbol";

export class ObjdumpSection {
    public symbols = new KeyedSortedSet<number, ObjdumpSymbol>(l => l.address);

    public flags: string[] = [];

    constructor(public readonly nmRun: NmRun, public readonly name: string, public readonly address: number, public readonly size: number) { }

    public contains(address: number) {
        return address >= this.address && address < this.address + this.size;
    }

    public symbolFromAddress(address: number): ObjdumpSymbol | undefined {
        if (this.contains(address)) {
            const search = this.symbols.binarySearch(address);
            if (search.item)
                return search.item;
            if (search.index > 0 && this.symbols.length >= search.index) {
                const previous = this.symbols.at(search.index - 1);
                if (previous?.contains(address)) {
                    return previous;
                }
            }
        }
    }
}