import { derived, get, Readable, writable, Writable } from 'svelte/store';
import { Schema, ValidationError } from 'yup';

type Field = string;

type FieldValue = string | boolean | undefined;

type FormMetaBoolean = Record<Field, boolean>;

export type FormValidationError = Record<Field, string>;

export type FormValuesObject = Record<Field, FieldValue>;

export type FormConfig = {
  initialValues: FormValuesObject,
  validationSchema: Schema<FormValuesObject | undefined>,
  validate: (form: FormValuesObject) => FormValidationError | undefined,
  onSubmit: (values: FormValuesObject, form: Writable<FormValuesObject>, errors: Writable<FormValidationError>) => void,
}


interface FormState {
  form: FormValuesObject;
  errors: FormValidationError;
  touched: FormMetaBoolean;
  isSubmitting: boolean;
  isValidating: boolean;
  isValid: boolean;
  modified: FormMetaBoolean;
  isModified: boolean;
}

export class Form {
  static NO_ERROR = '';
  static IS_TOUCHED = true;
  private initialValues: FormValuesObject = {};
  private onSubmit?:(values: FormValuesObject, form: Writable<FormValuesObject>, errors: Writable<FormValidationError>) => void;
  private validationSchema?: Schema<FormValuesObject | undefined>;
  private validateFn?: (form: FormValuesObject) => FormValidationError | undefined;
  private getInitial: { values: () => FormValuesObject, errors: () => FormValidationError, touched: () => FormMetaBoolean };
  form: Writable<FormValuesObject>;
  errors: Writable<FormValidationError>;
  touched: Writable<FormMetaBoolean>;
  isSubmitting: Writable<boolean>;
  isValidating: Writable<boolean>;
  isValid: Readable<boolean>;
  modified: Readable<FormMetaBoolean>;
  isModified: Readable<boolean>;
  state: Readable<FormState>;

  constructor({ onSubmit, initialValues, validate, validationSchema }: Partial<FormConfig>) {
    this.isInitialValuesValid(initialValues);
    this.onSubmit = onSubmit;
    this.initialValues = initialValues || {};
    this.validateFn = validate;
    this.validationSchema = validationSchema;
    
    this.getInitial = {
      values: () => this.clone(this.initialValues),
      errors: () => this.assign(<FormValidationError> this.initialValues, Form.NO_ERROR),
      touched: () => this.assign(<FormMetaBoolean> this.initialValues, !Form.IS_TOUCHED),
    };

    this.form = writable(this.getInitial.values());
    this.errors = writable(this.getInitial.errors());
    this.touched = writable(this.getInitial.touched());
    this.isSubmitting = writable(false);
    this.isValidating = writable(false);
    this.isValid = derived([this.errors, this.touched], ([$errors, $touched]) => {
      const allTouched = Object.values($touched)
        .every((field) => field === Form.IS_TOUCHED);
      const noErrors = Object.values($errors)
        .every((field) => field === Form.NO_ERROR);
      return allTouched && noErrors;
    });
    this.modified = derived(this.form, ($form) => {
      const object = this.assign(<FormMetaBoolean> $form, false);
      
      for (const key in $form) {
        if ($form[key] !== this.initialValues[key]) {
          object[key] = true;
        }
      }
      
      return object;
    });
    this.isModified = derived(this.modified, ($modified) => {
      return Object.values($modified).some((field) => field === true);
    });
    this.state = derived(
      [
        this.form,
        this.errors,
        this.touched,
        this.modified,
        this.isValid,
        this.isValidating,
        this.isSubmitting,
        this.isModified,
      ],
      ([
        $form,
        $errors,
        $touched,
        $modified,
        $isValid,
        $isValidating,
        $isSubmitting,
        $isModified,
      ]) => ({
        form: $form,
        errors: $errors,
        touched: $touched,
        modified: $modified,
        isValid: $isValid,
        isSubmitting: $isSubmitting,
        isValidating: $isValidating,
        isModified: $isModified,
      }),
    );
  }

  async handleChange({ target: element }: { target: HTMLInputElement }): Promise<void> {
    if (element) {
      const field = element.name || element.id;
      const value = this.isCheckbox(element) ? element.checked : element.value;
  
      return this.updateValidateField(field, value);
    }
  }

  handleReset(): void {
    this.form.set(this.getInitial.values());
    this.errors.set(this.getInitial.errors());
    this.touched.set(this.getInitial.touched());
  }

  async handleSubmit(event?: Event): Promise<void> {
    if (event && event.preventDefault) {
      event.preventDefault();
    }

    this.isSubmitting.set(true);

    const values = await this.subscribeOnce(this.form);
      
    if (this.validateFn) {
      this.isValidating.set(true);

      const error = this.validateFn(values);
        
      if (error == null || Object.keys(error).length <= 0) {
        this.clearErrorsAndSubmit(values);
      } else {
        this.errors.set(error);
        this.isSubmitting.set(false);
      }

      this.isValidating.set(false);
      return;
    }

      
    if (this.validationSchema) {
      this.isValidating.set(true);

      try {
        await this.validationSchema.validate(values, {abortEarly: false});
        this.clearErrorsAndSubmit(values);
      } catch (yupErrors) {
        if (yupErrors && yupErrors.inner) {
          yupErrors.inner.forEach((error: ValidationError) =>
            this.update(this.errors, error.path, error.message),
          );
        }
        this.isSubmitting.set(false);
      } finally {
        this.isValidating.set(false);
      }
      return;
    }

    this.clearErrorsAndSubmit(values);
  }

  async validateField(field: string): Promise<void> {
    const values = await this.subscribeOnce(this.form);
    return this.validateFieldValue(field, values[field]);
  }
  
  updateField(field: Field, value: FieldValue): void {
    if (value) {
      this.update(this.form, field, value);
    }
  }

  updateTouched(field: Field, value: boolean): void {
    this.update(this.touched, field, value);
  }

  updateValidateField(field: Field, value: FieldValue): Promise<void> {
    this.updateField(field, value);
    return this.validateFieldValue(field, value);
  }

  updateInitialValues(newValues: FormValuesObject): void {
    if (!this.isInitialValuesValid(newValues)) {
      return;
    }
    this.initialValues = newValues;
    this.handleReset();
  }

  private clearErrorsAndSubmit(values: FormValuesObject): void {
    if (this.onSubmit != null) {
      this.errors.set(<FormValidationError> this.assign(values, ''));
      this.onSubmit(values, this.form, this.errors);
    }
    this.isSubmitting.set(false);
  }

  private isCheckbox(element: HTMLInputElement): boolean {
    return element.getAttribute && element.getAttribute('type') === 'checkbox';
  }

  private async validateFieldValue(field: Field, value: FieldValue): Promise<void> {
    this.updateTouched(field, true);

    if (this.validationSchema) {
      this.isValidating.set(true);

      try {
        await this.validationSchema.validateAt(field, get(this.form));
        this.update(this.errors, field, '');
      } catch (error) {
        this.update(this.errors, field, error.message);
      } finally {
        this.isValidating.set(false);
      }
      return;
    }

    if (this.validateFn) {
      this.isValidating.set(true);
      const errs = this.validateFn({ [field]: value });
      this.update(this.errors, field, errs != null ? errs[field] : ''),
      this.isValidating.set(false);
      return;
    }
  }

  private isInitialValuesValid(initialValues: FormValuesObject = {}): boolean {
    if (Object.keys(initialValues).length === 0) {
      const provided = JSON.stringify(initialValues);
      console.warn(`initialValues need to be a non empty object or array, provided ${provided}`,);
      return false;
    }
  
    return true;
  }

  private update<T>(object: Writable<Record<string, T>>, path: string, value: T): void {
    object.update((record) => {
      record[path] = value;
      return record;
    });
  }

  private assign<T>(object: Record<string, T>, value: T): Record<string, T> {
    const copy: Record<string, T> = {};
    for (const key in object) {
      copy[key] = value;
    }
    return copy;
  }

  private clone<T>(object: T): T {
    return JSON.parse(JSON.stringify(object));
  }

  private async subscribeOnce<T>(observable: Readable<T>): Promise<T> {
    return new Promise((resolve) => {
      observable.subscribe(resolve)(); // immediately invoke to unsubscribe
    });
  }
}
