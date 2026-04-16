import { KeyedSortedSet } from "./KeyedSortedSet";
import { NmLine } from "./nmLine";
import { ObjdumpInstruction } from "./objdumpInstruction";
import { ObjdumpSection } from "./objdumpSection";

export class ObjdumpLabel
{
    public instructions = new KeyedSortedSet<number, ObjdumpInstruction>(i => i.address);

    public get addressStr() { return this.address.toString(16); }

    public get lastAddress() { return this.instructions.last?.address ?? this.address; }

    public get location() { return this.instructions.at(0)?.location; }

    public nmLine?: NmLine;

    constructor(public readonly address: number, public readonly name: string, public readonly section: ObjdumpSection)
    {}

    public contains(address: number)
    {
        if (this.nmLine?.size)
        {
            return this.nmLine.contains(address);
        }
        else
        {
            return this.address <= address && this.lastAddress >= address;
        }
    }
}