/**
 * Maps registered storage area names to objects implementing the Storage interface. Initially,
 * local and session storage objects are registered represented by the standard
 * `window.localStorage` and `window.sessionStorage` objects repspectively. Custom implementations
 * of storage areas can be added via the {@link StateAPI!registerCustomStorage} function.
 */
export interface IRegisteredStorageAreas
{
    local: Storage;
    session: Storage;
}



/**
 * Represents object that provides configuration parameters determining the behavior for persisting
 * a state variable. This type is used with the {@link StateAPI.configStateVarFunc} function.
 */
export type StateVarConfig =
{
    /**
     * Prefix used when creating keys for objects persisted as storage item. This is used to
     * distinguish the similarly named scopes and keys from different application. If this property
     * is not defined, the "default" string is used by default. This value can be overridden via
     * options when creating a state variable handler using the configured function.
     */
    app?: string;

    /**
     * Prefix used to combine multiple state variables in a single object that is persisted as a
     * single storage item. If this property is not defined, the "default" string is used by
     * default. This value can be overridden via options when creating a state variable handler
     * using the configured function.
     */
    scope?: string;

    /**
     * Storage object name used to save and retrive values corresponding to string keys. If undefined,
     * the local storage is used, which is retrieved using `window.localStorage`.
     */
    storage?: Storage | keyof IRegisteredStorageAreas;
};



/**
 * Represents object that provides options for persisting a state variable.
 */
export type StateVarOptions = StateVarConfig &
{
    /**
     * Flag indicating that the value should not be read from the storage upon state initialization.
     * This can be used when the desired state value is explicitly passed to a component, so that
     * the storage is ignored.
     */
    noGetOnInit?: boolean;
};



/**
 * Represents an object with functions for retrieving and persisting the value of a certain state variable.
 * @typeParam T State variable type
 */
export interface IStateVarHandler<T>
{
    /** Retrieves the current value of the state variable. */
    get(): T;

    /** Sets the new value of the state variable. */
    set(val: T): void;

    /** Clears the value of the state variable so that the `get()` method would return the default value. */
    clear(): void;
}



/**
 * Defines a type that can be specified as an initial value for a state variable of type T.
 * This can be either a value of type T or a function that returns a value of type T. The function
 * will only be called if the variable's value is not found in the storage.
 */
export type StateVarInitValue<T> = T | ((key?:string) => T);



/**
 * Defines the signature of the function that is used to retrievevalues of state variables. A
 * default function {@link StateAPI!getStateVar} fits this signature and additional functions
 * bound to certain configuration parameters can be created using the
 * {@link StateAPI!configStateVarFunc} function.
 */
export interface GetStateVarFunc
{
    <T>(key: string, init: StateVarInitValue<T>, options?: StateVarOptions): IStateVarHandler<T>
}



