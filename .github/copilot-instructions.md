# Copilot Instructions

## Prompts

### General Coding

- **any type**: Do not under any circumstance allow any any type to enter the code. any is not a valid type in this code base. Remove any any type from the TypeScript code.
  
- **Consistency**: Adhere to a specific coding standard or style guide (e.g., [Airbnb's JavaScript Style Guide](https://github.com/airbnb/javascript)) to ensure uniformity across all files.

- **Simplicity**: Write simple, clean, and elegant code that is easy to understand. Use descriptive variable and function names to enhance readability. Avoid complex or convoluted logic.

- **Standards**: Ensure all code adheres to industry-standard best practices, suitable for review by a Senior TypeScript Software Engineer at leading tech companies.

- **Imports**: Configure tools like ESLint to enforce the `eslint-import/no-duplicates` rule, preventing duplicate imports.

- **TypeScript**:
  - Prefer interfaces over types for defining object shapes, especially when expecting that a class or object will be implemented or extended.
  - Avoid using the `any` type. Instead, use more precise types or `unknown` when the type is not known, as it is safer than `any`.
  - Avoid using the types `Number`, `String`, `Boolean`, `Symbol`, or `Object` (with an uppercase first letter), as they refer to non-primitive boxed objects. Instead, use the lowercase versions: `number`, `string`, `boolean`, `symbol`, and `object`.
  - Use enums to define a set of named constants, enhancing code readability and maintainability. For example:

    ```typescript
    enum EventType {
        Create,
        Delete,
        Update
    }
    ```

    This approach provides a clear and concise way to handle related constants.
  - Avoid empty interfaces, as they do not enforce any contracts and can lead to inconsistencies. Ensure that interfaces define the expected structure and properties.
  - Explicitly specify access modifiers (`public`, `private`, `protected`) for class members to define their visibility and encapsulation clearly. This practice enhances code readability and maintainability.
  - Adopt standard naming conventions to maintain consistency across the codebase:
    - Use `camelCase` for variables, functions, and class members.
    - Use `PascalCase` for class and interface names.
    - Use `UPPER_CASE` for constants and enum values.

    Consistent naming improves code readability and helps developers understand the role and purpose of different identifiers. :contentReference[oaicite:4]{index=4}
  - Leverage TypeScript's utility types, such as `Partial`, `Readonly`, and `Pick`, to create new types based on existing ones. This practice promotes code reuse and reduces redundancy.
  - Refrain from using the non-null assertion operator (`!`), as it can mask potential `null` or `undefined` errors. Instead, perform proper null checks to ensure values are valid before use.
  - When a function can accept multiple types, prefer using union types over function overloading for simplicity and clarity.
  
- **Class Member Ordering**:
  - Organize class members in the following sequence:
    1. **Index Signatures**: Define any index signatures first.
    2. **Fields**:
       - Static fields (public, protected, private, and `#private`).
       - Instance fields (public, protected, private, and `#private`).
    3. **Constructors**: Place the constructor after fields.
    4. **Methods**:
       - Static methods (public, protected, private, and `#private`).
       - Instance methods (public, protected, private, and `#private`).
    5. **Private**:
       - Private methods and fields star with underscore, _.

    This structure enhances code readability and maintainability by providing a predictable and consistent organization.

  - Implement a consistent order for class members to make the code easier to read, navigate, and edit. For example, you might choose to always list public members before private ones, or static members before instance members. Consistency in member ordering helps developers understand the structure and responsibilities of a class more quickly.

- **Testability**:
  - **Single Responsibility Principle**: Design classes and functions to have a single responsibility, which simplifies testing by reducing dependencies and isolating functionality.
  - **Dependency Injection**: Inject dependencies (e.g., services, configurations) into classes and functions rather than hardcoding them. This approach facilitates the use of mocks or stubs during testing.
  - **Avoid Global State**: Minimize reliance on global variables or state, as they can lead to unpredictable behavior in tests. Instead, pass necessary data explicitly to functions or classes.
  - **Pure Functions**: Favor pure functions that return outputs solely based on their inputs and have no side effects. Pure functions are inherently more testable.
  - **Interface Segregation**: Define clear interfaces for your components and services. This practice allows for the creation of mock implementations during testing.
  - **Asynchronous Code Handling**: When dealing with asynchronous operations, use Promises or async/await syntax to simplify testing and avoid callback hell.

- **Best Practices**:
  - Provide multiple solutions only when it adds significant value to the discussion.
  - Align with established paradigms in the project's codebase to maintain cohesion and consistency.

- **Comments**: Strive to write self-explanatory code to minimize the need for comments. However, include comments where they significantly enhance understanding, especially in complex logic.

- **Error Checking**: In addition to double-checking for TypeScript errors, advocate for thorough testing and code reviews to catch potential issues.

- **Optimization**: Write efficient algorithms and analyze their time complexity. Aim for O(n) complexity; avoid O(n²) or worse.

- **Pure Functions**: Prefer pure, deterministic functions and functional programming principles where appropriate, while considering practical scenarios where side effects are necessary.

- **Optimization**: Optimize for developer experience first. Optimize for speed second. Optimize the code. Optimize the code. Optimize the code.

- **Correct any spelling errors** in code, including variable names, function names, property names, etc.

- **Choose descriptive names** for properties, members, types, functions, methods, and classes that clearly convey their purpose.

- **Follow established naming conventions**, e.g., use camelCase for functions and variables, PascalCase for classes and interfaces, and UPPER_CASE for constants.
  
- **VS Code Setting: Observable**

  - **Observable Updates with Transactions**:  
    When updating an observable via `obs.set(valueToUpdate)`, adhere to the following guidelines:
    - **Multiple Updates in One Tick**:  
      If you plan to update multiple observables within the same tick, wrap the updates in a transaction. For example:

      ```typescript
      transaction(tx => {
        obs1.set(valueToUpdate, tx);
        obs2.set(valueToUpdate, tx);
        // ...additional sets as needed
      });
      ```

      This ensures that all observers wait until the transaction is complete before emitting updates.

    - **Single Update in One Tick**:  
      If you are performing a single update (i.e., not batching multiple updates), pass `undefined` as the second parameter:

      ```typescript
      obs.set(valueToUpdate, undefined);
      ```

      This signals that no transaction is active, and the update can be emitted immediately.

### Fluent UI

- **Version**: Use Microsoft React Fluent UI v9 exclusively. Specify the exact version to prevent discrepancies due to updates.

- **Standards**: Ensure all design code adheres to Microsoft's design guidelines and best practices.

- **Consistency**: Provide examples or guidelines to ensure visual consistency throughout the application.

- **Aesthetics**: Follow specific design principles to create a simple, clean, and elegant user interface, focusing on user experience.

### React

- **Hooks**: Import hooks like `useState`, `useCallback`, and `useMemo` directly to ensure consistency and clarity.

- **Best Practices**: Follow React best practices for functional components and hooks, referring to the [official React documentation](https://react.dev/) for guidance.

### Templates

- **Consistency**: Define consistent design and implementation patterns for templates and reusable components, providing examples where possible.

- **Simplicity**: Offer guidelines on achieving simplicity and maintainability in templates, aligning with the overall application architecture.
