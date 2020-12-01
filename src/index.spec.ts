import { Form, FormConfig, FormValuesObject, FormValidationError } from '.';
import * as yup from 'yup';
import Chance from 'chance';
import { Readable } from 'svelte/store';

const chance = new Chance();

function nonEmpty(array: string[]) {
  return array.filter((str) => str !== '');
}

function subscribeOnce<T>(observable: Readable<T>): Promise<T> {
  return new Promise((resolve) => {
    observable.subscribe(resolve)(); // immediately invoke to unsubscribe
  });
}

describe('createForm', () => {
  let instance: Form;
  const initialValues = {
    name: chance.name(),
    email: chance.email(),
    country: chance.country(),
  };
  let validationSchema: yup.Schema<FormValuesObject | undefined> = yup.object().shape({
    name: yup.string().required(),
    email: yup.string().email().required(),
    country: yup.string().required(),
  });
  const onSubmit = jest.fn();

  function getInstance(options: Partial<FormConfig> = {}) {
    return new Form({
      initialValues: options.initialValues || initialValues,
      validationSchema: options.validationSchema || validationSchema,
      onSubmit: options.onSubmit || onSubmit,
    });
  }

  beforeEach(() => {
    instance = getInstance();
  });

  describe('config', () => {
    it('requires initialValues to be provided and not to be empty', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      const initialValues = {};
      const config = {initialValues, onSubmit: jest.fn()};

      new Form(config);
      expect(consoleWarn).toBeCalledWith(
        'initialValues need to be a non empty object or array, provided {}',
      );
    });
  });

  describe('$form', () => {
    it('returns an observable with a subscribe method', () => {
      expect(instance.form.subscribe).toBeDefined();
    });

    it('contains the current values which are accessed by subscription', () => {
      subscribeOnce(instance.form).then((values) => {
        expect(values.name).toBe(initialValues.name);
        expect(values.email).toBe(initialValues.email);
        expect(values.country).toBe(initialValues.country);
      });
    });
  });

  describe('$errors', () => {
    it('returns an observable with a subscribe method', () => {
      expect(instance.errors.subscribe).toBeDefined();
    });

    it('contains the current values which are accessed by subscription', () => {
      subscribeOnce(instance.errors).then((errors) => {
        expect(errors.name).toBe('');
        expect(errors.email).toBe('');
        expect(errors.country).toBe('');
      });
    });
  });

  describe('$touched', () => {
    it('returns an observable with a subscribe method', () => {
      expect(instance.errors.subscribe).toBeDefined();
    });

    it('contains the current values which are accessed by subscription', () => {
      subscribeOnce(instance.touched).then((touched) => {
        expect(touched.name).toBe(false);
        expect(touched.email).toBe(false);
        expect(touched.country).toBe(false);
      });
    });
  });

  describe('$isValid', () => {
    it('returns an observable with a subscribe method', () => {
      expect(instance.isValid.subscribe).toBeDefined();
    });

    it('returns false if form is invalid', () => {
      instance = getInstance({
        initialValues: {
          name: '',
          email: '',
          country: '',
        }
      });
      subscribeOnce(instance.isValid).then((isValid) =>
        expect(isValid).toBe(false),
      );
    });

    it('returns false if some fields are untouched', async () => {
      const touched = await subscribeOnce(instance.touched);
      const someUntouched = Object.values(touched).some((val) => val === false);
      expect(someUntouched).toBe(true);

      const isValid = await subscribeOnce(instance.isValid);
      expect(isValid).toBe(false);
    });

    it('returns true if form is valid and all fields touched', () => {
      instance.touched.set({
        name: true,
        email: true,
        country: true,
      });
      subscribeOnce(instance.isValid).then((isValid) =>
        expect(isValid).toBe(true),
      );
    });
  });

  describe('handleReset', () => {
    it('resets form to initial state', () => {
      instance.form.set({name: 'foo'});
      subscribeOnce(instance.form).then((values) =>
        expect(values.name).toBe('foo'),
      );

      instance.handleReset();
      subscribeOnce(instance.form).then((form) =>
        expect(form.name).toBe(form.name),
      );
    });

    it('resets errors to initial state', () => {
      instance.errors.set({name: 'name is required'});
      subscribeOnce(instance.errors).then((errors) =>
        expect(errors.name).toBe('name is required'),
      );

      instance.handleReset();
      subscribeOnce(instance.errors).then((errors) =>
        expect(errors.name).toBe(''),
      );
    });

    it('resets touched to initial state', () => {
      instance.touched.set({name: true});
      subscribeOnce(instance.touched).then((touched) =>
        expect(touched.name).toBe(true),
      );

      instance.handleReset();
      subscribeOnce(instance.touched).then((touched) =>
        expect(touched.name).toBe(false),
      );
    });
  });

  describe('handleChange', () => {
    it('updates the form when connected to change handler of input', async () => {
      const email = chance.email();
      const input = document.createElement('input');
      input.name = 'email';
      input.value = email;

      let form = await subscribeOnce(instance.form);
      expect(form.email).toBe(initialValues.email);

      await instance.handleChange({ target: input });
      
      form = await subscribeOnce(instance.form);
      expect(form.email).toBe(email);
    });

    it('uses checked value for checkbox inputs', async () => {
      instance = getInstance({
        initialValues: {
          terms: false,
        },
        validationSchema: yup.object().shape({
          terms: yup.bool().oneOf([true]),
        }),
      });
      const input = document.createElement('input');
      input.setAttribute('type', 'checkbox');
      input.name = 'terms';
      input.checked = true;

      await instance.handleChange({ target: input });

      const form = await subscribeOnce(instance.form);
      expect(form.terms).toBe(true);
    });

    it('runs field validation when validateSchema is provided', async () => {
      const invalid = 'invalid.email';
      const input = document.createElement('input');
      input.name = 'email';
      input.value = invalid;

      await instance.handleChange({ target: input });
      try {
        await subscribeOnce(instance.errors);
      } catch (errors) {
        expect(errors.email).toBe('email must be a valid email');
      }
    });

    it('runs field validation when validateFn is provided', async () => {
      const invalid = 'invalid.email';
      const input = document.createElement('input');
      input.name = 'email';
      input.value = invalid;
      const instance = new Form({
        initialValues: {
          email: '',
        },
        validate: (values: FormValuesObject) => {
          const errs: FormValidationError = {};
          if (values.email === 'invalid.email') {
            errs.email = 'this email is invalid';
          }
          return errs;
        },
        onSubmit: (values) => console.log(values),
      });
      await instance.handleChange({ target: input});

      const errors = await subscribeOnce(instance.errors);
      expect(errors.email).toBe('this email is invalid');
    });

    it('does not throw when no validationSchema or validateFn provided', () => {
      const input = document.createElement('input');
      input.name = 'email';
      input.value = 'foo';
      const instance = new Form({
        initialValues: {email: ''},
        onSubmit: console.log.bind(console),
      });

      expect(() => instance.handleChange({ target: input })).not.toThrow();
    });

    it('assigns empty string to field if validateFn returns undefined', async () => {
      const value = 'email@email.com';
      const input = document.createElement('input');
      input.name = 'email';
      input.value = value;

      const instance = new Form({
        initialValues: {
          email: '',
        },
        validate: () => undefined,
        onSubmit: (values) => console.log(values),
      });

      await instance.handleChange({ target: input });
      const errors = await subscribeOnce(instance.errors);
      expect(errors.email).toBe('');
    });
  });

  describe('handleSubmit', () => {
    it('validates form on submit when validationSchema is provided', async () => {
      instance = getInstance({
        initialValues: {
          name: '',
          email: '',
          country: '',
        },
      });

      let errors = await subscribeOnce(instance.errors);
      let errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
    
      await instance.handleSubmit();
      errors = await subscribeOnce(instance.errors);
      errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(3);
    });

    it('calls onSubmit when form is valid', async () => {
      expect(onSubmit).not.toBeCalled();
      await instance.handleSubmit();
      expect(onSubmit).toBeCalled;
    });

    it('does not call onSubmit when form is invalid', async () => {
      const onSubmit = jest.fn();
      // create invalid form
      instance = getInstance({
        initialValues: {name: ''},
        onSubmit,
      });
      await instance.handleSubmit();
      expect(onSubmit).not.toBeCalled;
    });

    it('calls onSubmit with formValues, $form and $error', async () => {
      const onSubmit = jest.fn();
      instance = getInstance({onSubmit});

      await instance.handleSubmit();
      const [formValue, $form, $errors] = onSubmit.mock.calls[0]; // onSubmit callback args

      expect(formValue.name).toBe(initialValues.name);
      expect(formValue.email).toBe(initialValues.email);
      expect(formValue.country).toBe(initialValues.country);

      const form: FormValuesObject = await subscribeOnce($form);
      expect(form.name).toBe(initialValues.name);
      expect(form.email).toBe(initialValues.email);
      expect(form.country).toBe(initialValues.country);
      
      const errors: FormValidationError = await subscribeOnce($errors);
      expect(errors.name).toBe('');
      expect(errors.email).toBe('');
      expect(errors.country).toBe('');
      
    });
  });

  describe('validateField', () => {
    it('validate a field only by name', async () => {
      instance = getInstance({
        initialValues: {
          name: '',
          email: '',
          country: '',
        },
      });

      let errors = await subscribeOnce(instance.errors);
      let errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
      

      await instance.validateField('email');
      errors = await subscribeOnce(instance.errors);
      errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(1);
    });
  });
  describe('updateValidateField', () => {
    it('update and validate a single field', async () => {
      instance = getInstance({
        initialValues: {
          name: '',
          email: '',
          country: '',
        },
      });

      instance.errors.set({name: 'name is required'});
        
      let errors = await subscribeOnce(instance.errors);
      let errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(1);
      

      await instance.updateValidateField('name', 'name');
      errors = await subscribeOnce(instance.errors);
      errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
    });
  });

  describe('when a validation depends on another field: using when', () => {
    beforeEach(() => {
      validationSchema = yup.object().shape({
        wantsSomething: yup.boolean(),
        what: yup.string().when('wantsSomething', {
          is: true,
          then: yup.string().required(),
        }),
      });
    });

    it('when a is true, b is required', async () => {
      instance = getInstance({
        initialValues: {
          wantsSomething: true,
        },
      });

      let errors = await subscribeOnce(instance.errors);
      let errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
      

      await instance.handleSubmit();
      errors = await subscribeOnce(instance.errors);
      errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(1);
      expect(errors.what).toBe('what is a required field');
    });
    it('when a is false, b is not required', async () => {
      instance = getInstance({
        initialValues: {
          wantsSomething: false,
        },
      });

      let errors = await subscribeOnce(instance.errors);
      let errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
      

      await instance
        .handleSubmit();
      errors = await subscribeOnce(instance.errors);
      errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
    });
  });

  describe('when a validation depends on another field: using ref', () => {
    beforeEach(() => {
      validationSchema = yup.object().shape({
        password: yup.string().required(),
        passwordConfirmation: yup
          .string()
          .oneOf([yup.ref('password'), undefined], 'Passwords don\'t match!'),
      });
    });

    it('is invalid when passwords don\'t match', async () => {
      instance = getInstance({
        initialValues: {
          password: 'a',
          passwordConfirmation: 'b',
        },
      });

      let errors = await subscribeOnce(instance.errors);
      let errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
      

      await instance.handleSubmit();
      errors = await subscribeOnce(instance.errors);
        
      errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(1);
      expect(errors.passwordConfirmation).toBe('Passwords don\'t match!');
    });

    it('is valid when passwords match', async () => {
      instance = getInstance({
        initialValues: {
          password: 'a',
          passwordConfirmation: 'a',
        },
      });

      let errors = await subscribeOnce(instance.errors);
      let errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
      

      instance.handleSubmit();
      errors = await subscribeOnce(instance.errors);
      errorValues = nonEmpty(Object.values(errors));
      expect(errorValues.length).toBe(0);
    });
  });
});