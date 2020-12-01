<h1 align="center">Svelte Formik Library</h1>

<p align="center">
  <i>
    A form library for <b><a href="https://svelte.dev/">Svelte</a></b> inspired by the <b><a href="https://formik.org/">Formik</a></b> API
  </i>
</p>

<p align="center">
  <b><a href="#installation">Install</a></b>
  |
  <b><a href="#usage">Usage</a></b>
</p>

## Installation

The library is available on [npm](https://npmjs.com)

```sh
# npm install
npm install --save svelte-formik
# yarn install
yarn add svelte-formik
```

## Usage

Here's an example of a basic form component without any form validation.


```html
<script>
  import { Form } from "svelte-formik";

  const { form, handleChange, handleSubmit } = new Form({
    initialValues: { title: "", lastName: "", firstName: "" },
    onSubmit: values => {
      alert(JSON.stringify(values));
    }
  });
</script>

<form on:submit={handleSubmit}>
  <label for="title">title</label>
  <select
    id="title"
    name="title"
    on:change={handleChange}
    bind:value={$form.title}>
    <option></option>
    <option>Mr.</option>
    <option>Mrs.</option>
    <option>Mx.</option>
  </select>

  <label for="lastName">Last Name</label>
  <input
    id="lastName"
    name="lastName"
    on:change={handleChange}
    bind:value={$form.lastName}
  />

  <label for="firstName">First Name</label>
  <input
    id="firstName"
    name="firstName"
    on:change={handleChange}
    bind:value={$form.firstName}
  />

  <button type="submit">Submit</button>
</form>
```



