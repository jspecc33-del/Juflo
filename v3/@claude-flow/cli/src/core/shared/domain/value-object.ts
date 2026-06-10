/**
 * ValueObject - DDD Base Class
 *
 * Immutable objects identified by their attribute values, not identity.
 * Two value objects with identical props are considered equal.
 *
 * @module v3/cli/core/shared/domain
 */

export abstract class ValueObject<TProps> {
  protected readonly props: TProps;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props as object }) as TProps;
  }

  public equals(other?: ValueObject<TProps>): boolean {
    if (!other || !(other instanceof ValueObject)) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
