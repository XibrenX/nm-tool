import { ObjdumpSymbol } from "./objdumpSymbol";

export class ObjdumpInstruction {
    public get addressStr() { return this.address.toString(16); }

    constructor(
        public readonly address: number,
        public readonly assembly: string,
        public readonly location: string | undefined,
        public readonly symbol: ObjdumpSymbol
    ) { }

    public get assemblyInstruction() {
        const firstSpaceIndex = this.assembly.match(/\s+/)?.index;
        return this.assembly.substring(0, firstSpaceIndex ?? this.assembly.length);
    }

    tryGetRef(): ObjdumpInstruction | undefined {
        const assemblyRefRegex = /([A-Fa-f0-9]+)\s*</g;
        const refMatches = this.assembly.matchAll(assemblyRefRegex);
        for (const refMatch of refMatches) {
            const refAddress = parseInt(refMatch[1], 16);
            const refFound = this.symbol.section.nmRun.getFromAddress(refAddress);
            if (refFound instanceof ObjdumpInstruction) {
                return refFound;
            }
        }

        const commendRef = /(?:\/\/|@)\s+([A-Fa-f0-9]+)\b/g;
        const commendRefMatches = this.assembly.matchAll(commendRef);
        for (const commendRef of commendRefMatches) {
            const refAddress = parseInt(commendRef[1], 16);
            const refFound = this.symbol.section.nmRun.getFromAddress(refAddress);
            if (refFound instanceof ObjdumpInstruction) {
                return refFound;
            }
        }
    }
}