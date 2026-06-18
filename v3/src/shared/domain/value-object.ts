/**
 * Value Object Base Class
 *
 * Base class for immutable domain values compared by their attributes
 * rather than identity. Props are frozen at construction time.
 */

export abstract class ValueObject<T extends object> {
  protected readonly props: T;

  constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: ValueObject<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (!(other instanceof ValueObject)) {
      return false;
    }

    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
