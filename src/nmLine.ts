import * as path from 'path';
import { NmRun } from "./nmRun";
import { ObjdumpLabel } from './objdumpLabel';

export class NmLine {
    public readonly address: number;
    public readonly size?: number;
    public readonly type: string;
    public readonly name: string;
    public readonly file?: string;
    public readonly line?: number;

    public objdumpLabel?: ObjdumpLabel;

    constructor(line: string, public readonly run: NmRun) {
        const lineParts = line.split(' ');
        let linePartsIndex = 0;

        this.address = parseInt(lineParts[linePartsIndex], 16);
        linePartsIndex += 1;

        if (lineParts[linePartsIndex].length > 1) {
            this.size = parseInt(lineParts[linePartsIndex], 16);
            linePartsIndex += 1;
        }

        this.type = lineParts[linePartsIndex];
        linePartsIndex += 1;

        const nameAndLocation = lineParts.slice(linePartsIndex).join(' ').split('\t');
        this.name = nameAndLocation[0];

        if (nameAndLocation.length >= 2) {
            const fileAndLine = nameAndLocation[1].split(':');
            this.file = fileAndLine[0];
            if (fileAndLine.length >= 2) {
                this.line = parseInt(fileAndLine[1], 10);
            }
        }
    }

    matchesFileName(otherFileName: string): boolean {
        if (this.file !== undefined) {
            let matchFileName = this.file;
            if (!matchFileName.startsWith(path.sep)) {
                matchFileName = path.sep + matchFileName;
            }

            return otherFileName.endsWith(matchFileName);
        }
        else {
            return false;
        }
    }

    contains(address: number)
    {
        if (this.size)
        {
            return this.address <= address && this.address + this.size > address;
        }
        else
        {
            return false;
        }
    }
}