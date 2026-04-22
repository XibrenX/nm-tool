
export class KeyedSortedSet<TKey, T> {
    private readonly _array: T[] = [];

    constructor(private readonly _key: (item: T) => TKey) { }

    public get length(): number { return this._array.length; }

    public get last(): T | undefined {
        if (this._array.length > 0)
            return this._array[this._array.length - 1];
    }

    push(item: T, merge: (newItem: T, oldItem: T) => T) {
        const key = this._key(item);
        if (this._array.length === 0) {
            this._array.push(item);
            return;
        }

        const lastKey = this._key(this.last!);
        if (key > lastKey) {
            this._array.push(item);
            return;
        }

        const find = this.binarySearch(key);
        if (find.item) {
            this._array.splice(find.index, 1, merge(item, find.item));
            return;
        }

        this._array.splice(find.index, 0, item);
    }

    at(index: number): T | undefined {
        return this._array.at(index);
    }

    get(key: TKey): T | undefined {
        return this.binarySearch(key).item;
    }

    getOrAdd(key: TKey, createItem: () => T): T {
        const find = this.binarySearch(key);
        if (find.item)
            return find.item;

        const createdItem = createItem();
        this._array.splice(find.index, 0, createdItem);
        return createdItem;
    }

    delete(key: TKey) {
        const find = this.binarySearch(key);
        if (find.item) {
            this._array.splice(find.index, 1);
        }
    }

    clear() {
        this._array.length = 0;
    }

    values() {
        return this._array.values();
    }

    as_array() {
        return this._array.slice();
    }

    [Symbol.iterator]() {
        return this.values();
    }

    binarySearch(key: TKey): { index: number, item?: T } {
        let start: number = 0;
        let end: number = this._array.length;

        while (start != end) {
            const mid: number = Math.floor((start + end) / 2);
            const midKey = this._key(this._array[mid]);
            if (midKey === key) {
                return { index: mid, item: this._array[mid] };
            } else if (midKey < key) {
                start = mid + 1;
            } else {
                end = mid;
            }
        }

        return { index: start };
    }
}