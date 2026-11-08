export type Phone = 'none' | 'optional' | 'required'

// The backend's phone option, chosen when the project was generated.
export const PHONE: Phone = '{{ cookiecutter.phone }}'
