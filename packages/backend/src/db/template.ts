export class Sql {
  constructor(
    public strings: string[],
    public values: unknown[],
  ) {
    this.normalize();
  }

  normalize(start = 0, count = this.values.length) {
    let i = start;

    while (i < count) {
      const value = this.values[i];

      if (value instanceof Sql) {
        if (value.strings.length > 1) {
          this.values.splice(i, 1, ...value.values);
          this.strings[i] = (this.strings[i] ?? '') + value.strings[0];
          this.strings[i + 1] =
            value.strings.at(-1) + (this.strings[i + 1] ?? '');
          this.strings.splice(i + 1, 0, ...value.strings.slice(1, -1));
          count += value.values.length;
        } else {
          this.values.splice(i, 1);
          this.strings.splice(
            i,
            2,
            (this.strings[i] ?? '') +
              value.strings[0] +
              (this.strings[i + 1] ?? ''),
          );
          count -= 1;
        }
      } else {
        i++;
      }
    }
  }

  get text() {
    return this.strings.reduce(
      (prev, curr, i) => prev + (i > 0 ? '$' + i : '') + curr,
      '',
    );
  }

  append(other: Sql) {
    this.strings[this.strings.length - 1] += other.strings[0];
    this.strings.push(...other.strings.slice(1));
    this.values.push(...other.values);

    return this;
  }

  join(array: unknown[]) {
    const strings = new Array(Math.max(0, array.length - 1)).fill('');
    const interleaved: unknown[] = [];

    array.forEach((value, i) => {
      if (i > 0) {
        interleaved.push(this);
      }

      interleaved.push(value);
    });

    return new Sql(strings, interleaved);
  }
}

export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return new Sql([...strings], values);
}

function raw(raw: string) {
  return new Sql([raw], []);
}

sql.raw = raw;
