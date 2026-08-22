import {GetStateVarFunc, StateVarConfig, IStateVarHandler, StateVarOptions, IRegisteredStorageAreas, StateVarInitValue} from "./StateTypes"



/**
 * Retrieves a variable state handler for the given variable key, initial value and options. This
 * function doesn't use any configuration and any configuration parameters (if desired) are passed
 * via options. The returned {@link StateTypes!IStateVarHandler} interface has the functions:
 * `get()` and `set()`, which should be used to retrieve and save variable value.
 *
 * @typeParam T State variable type
 * @param key A key that distinguishes this variable from other variables within the application
 * and scope. This usually could be interpreted as "variable name".
 * @param init Initial value for the variable if a value for it doesn't exist in the storage yet.
 * @param options Optional parameters defining variable state behavior.
 * @returns An object that has two functions: `get()` and `set()`, which should be used to retrieve
 * and save variable value.
 */
export function getStateVar<T>(key: string, init: StateVarInitValue<T>, options?: StateVarOptions): IStateVarHandler<T>
{
    return getStateVarHandler.call({}, key, init, options);
}



/**
 * Returns a function that will behave as the {@link getStateVar} but configured with the
 * given configuration parameters. This is usually used to create a function that will handle
 * variable states withing a given application and scope and using a certain storage.
 *
 * **Example:**
 * ```typescript
 * // configure a function to work with the given app, scope and storage
 * const getMyAppWidgets = configStateVarFunc({
 *     app: "MyApp",
 *     scope: "Widgets",
 *     storage: window.sessionStorage,
 * });
 *
 * ...
 *
 * // using the configured function
 * const containerIsOpenHandler = getMyAppWidgets("ContainerIsOpen", false);
 * const visibleLinesHandler = getMyAppWidgets<number>("VisibleLines", 5);
 * ```
 *
 * @param config Configuration parameters
 * @returns A function that should be called to retrieve handler objects for variable states.
 */
export function configStateVarFunc(config: StateVarConfig): GetStateVarFunc
{
    return getStateVarHandler.bind(config);
}



/**
 * Implementation of state variable persistence that uses the given config, which can be partially
 * overridden by the given options to obtain get and set functions for retrieving and saving the
 * current value corresponding to the given key.
 */
function getStateVarHandler<T>(this: StateVarConfig, key: string, initVal: StateVarInitValue<any>, options?: StateVarOptions): IStateVarHandler<T>
{
    return new StateVarHandler(key, this, options, initVal) as IStateVarHandler<T>;
}



/**
 * Name of the default application, used to keep state variable values for which app name is not
 * explicitly specified.
 */
const DEFAULT_APP_NAME = "default";

/**
 * Name of the default scope, used to keep state variable values for which scope name is not
 * explicitly specified.
 */
const DEFAULT_SCOPE_NAME = "default";



/**
 * Keeps information about a single variable and its current value. This class is also
 * responsible for reading/writing the variable state into a cache object as well as reading and
 * writing the stringified cache object from/to the storage.
 */
class StateVarHandler implements IStateVarHandler<any>
{
    private key: string;
    private initVal: StateVarInitValue<any>;
    private cache: ScopeCache;

    constructor(key: string, config: StateVarConfig, options?: StateVarOptions, initVal?: StateVarInitValue<any>)
    {
        this.key = key;
        this.initVal = initVal;

        let app = options?.app ?? config.app ?? DEFAULT_APP_NAME;
        let scope = options?.scope ?? config.scope ?? DEFAULT_SCOPE_NAME;
        let cacheKey = `${app}@${scope}`;

        // get cache object or create it if it doesn't exist yet
        let cache = scopeCaches.get(cacheKey);
        if (!cache)
        {
            let storage = options?.storage ?? config.storage ?? window.localStorage;
            cache = new ScopeCache(app, scope, storage);
            scopeCaches.set(cacheKey, cache);
        }

        this.cache = cache;
    }

    get(): any { return this.cache.getVar(this.key, this.initVal); }
    set(val: any): void { this.cache.setVar(this.key, val); }
    clear(): void { this.cache.clearVar(this.key); }
}



/**
 * Name of the prefix, used to distinguish Mimstate storage items.
 */
const KEY_PREFIX = "Mimstate";



/**
 * Object containing an in-memory copy of the values of all variables for a given scope. A
 * stringified version of this object is kept under a key in the local or session storage.
 * Keys of this object are variable names and values are current variable values.
 */
class ScopeCache
{
    /** Storage used for persiting this object */
    private storage: Storage;

    /** Storage key used for persiting this object */
    private storageKey: string;

    /** Cached variable state values */
    private vars: { [Key: string]: any };

    /**
     * Flag indicating that a serialization task has been queued for this object but has not
     * run yet.
     */
    private writeScheduled: boolean;

    constructor(app: string, scope: string, storage: Storage | keyof IRegisteredStorageAreas)
    {
        this.storage = typeof storage === "string" ? storageAreas[storage] : storage;
        this.storageKey = `${KEY_PREFIX}@${app}@${scope}`;
        window.addEventListener("storage", this.onStorageChanged.bind(this));
    }

    onStorageChanged(e: StorageEvent): void
    {
        console.log(e.key);
    }



    /**
     * Determines whether the cache has a value for the given key.
     */
    hasVar(key: string): boolean
    {
        // deserialize the object from the storage if not deserialized yet
        this.read();

        return key in this.vars;
    }

    /**
     * Gets the value of the given key.
     */
    getVar(key: string, defaultVal?: StateVarInitValue<any>): any
    {
        // deserialize the object from the storage if not deserialized yet
        this.read();

        return (key in this.vars)
            ? this.vars[key]
            : typeof defaultVal === "function"
                ? defaultVal(key)
                : defaultVal;
    }

    /**
     * Sets the new value to the given key and if it is different from the old value,
     * schedules serialization.
     */
    setVar(key: string, newVal: any): void
    {
        // deserialize the object from the storage if not deserialized yet
        this.read();

        // if the same value for the key already exists in the cache, do nothing
        if (key in this.vars)
        {
            let oldVal = this.vars[key];
            if (newVal === oldVal)
                return;
        }

        // keep the new value in the cache
        this.vars[key] = newVal;

        // schedule serialization of the entire cache object to the storage if it is not
        // scheduled yet
        this.scheduleWrite();
    }

    /**
     * Removes the given key and schedules serialization.
     */
    clearVar(key: string): void
    {
        // if the same value for the key already exists in the cache, do nothing
        if (this.vars && key in this.vars)
        {
            // keep the new value in the cache
            delete this.vars[key];

            // schedule serialization of the entire cache object to the storage if it is not
            // scheduled yet
            this.scheduleWrite();
        }
    }

    /**
     * Deserializes the object from the storage.
     */
    private read(): void
    {
        if (!this.vars)
        {
            // check whether the serialized data already exists in the storage and is of the
            // correct type
            let s = this.storage.getItem(this.storageKey);
            if (s)
            {
                try
                {
                    this.vars = JSON.parse(s);
                    if (this.vars == null || typeof this.vars !== "object")
                    {
                        this.storage.removeItem(this.storageKey);
                        this.vars = {}
                    }
                }
                catch(x)
                {
                    this.storage.removeItem(this.storageKey);
                    this.vars = {}
                }
            }
            else
                this.vars = {};
        }
    }

    /**
     * Schedules serialization of the entire cache object to the storage if it is not
     * scheduled yet
     */
    private scheduleWrite(): void
    {
        if (!this.writeScheduled)
        {
            this.writeScheduled = true;
            queueMicrotask(this.write);
        }
    }

    /**
     * Serializes the entire cache object to string and writes it to the storage. This function
     * is invoked using the queueMicrotask; therefore, it must be bound to "this" - that's why
     * it is implemented as a fat arrow function variable.
     */
    private write = (): void =>
    {
        this.writeScheduled = false;
        try
        {
            this.storage.setItem(this.storageKey, JSON.stringify(this.vars));
        }
        catch(x)
        {
        }
    }
}



/**
 * Object that maps storage names to storage implementation objects.
 */
const storageAreas: IRegisteredStorageAreas =
{
    local: window.localStorage,
    session: window.sessionStorage,
}



/**
 * Map of ScopeCache objects by the scope names. The keys in this map are scope names, which are
 * different from the keys used to as storage item keys. The latter are scope names prefixed with
 * ""Mimstate@""
 */
const scopeCaches = new Map<string,ScopeCache>();



