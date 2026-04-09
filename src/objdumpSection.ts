import { NmRun } from "./nmRun";
import { ObjdumpLabel } from "./objdumpLabel";

export class ObjdumpSection
{
    public labels: ObjdumpLabel[] = [];

    public get address() { return this.labels.at(0)?.address ?? 0; }
    public get lastAddress() { return this.labels.at(this.labels.length - 1)?.address ?? this.address; }

    constructor(public readonly section: string, public readonly nmRun: NmRun)
    {}

    public contains(address: number)
    {
        const last: ObjdumpLabel | undefined = this.labels.at(this.labels.length - 1);
        if (last)
        {
            if (last.nmLine?.size)
            {
                return this.address <= address && last.address + last.nmLine.size > address;
            }
            else
            {
                return this.address <= address && last.lastAddress >= address;
            }
        }

        return this.address === address;
    }
}