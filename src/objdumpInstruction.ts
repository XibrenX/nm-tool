import { ObjdumpLabel } from "./objdumpLabel";

export class ObjdumpInstruction {
    public get addressStr() { return this.address.toString(16); }

    constructor(
        public readonly address: number,
        public readonly assembly: string,
        public readonly location: string | undefined,
        public readonly label: ObjdumpLabel
    ) { }

    public get assemblyInstruction() {
        const firstSpaceIndex = this.assembly.match(/\s+/)?.index;
        return this.assembly.substring(0, firstSpaceIndex ?? this.assembly.length);
    }

    tryGetRef(): ObjdumpInstruction | undefined {
        const assemblyRefRegex = /([A-Fa-f0-9]+)\s*</g;
        const refMatches = this.assembly.matchAll(assemblyRefRegex);
        for (const refMatch of refMatches) {
            // for now only use the first ref...
            const refAddress = parseInt(refMatch[1], 16);
            return this.label.section.nmRun.sections
                .filter(s => s.contains(refAddress))
                .flatMap(s => s.labels)
                .filter(l => l.contains(refAddress))
                .flatMap(l => l.instructions)
                .find(i => i.address === refAddress);
        }
    }
}