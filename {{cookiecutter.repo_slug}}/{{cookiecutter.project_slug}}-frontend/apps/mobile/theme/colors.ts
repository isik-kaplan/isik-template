// One place for every color the app's screens reach for, so a palette change is a one-line edit
// here instead of a grep across every StyleSheet.create() call.
export const colors = {
  primary: 'black',
  onPrimary: 'white',
  error: 'red',
  border: '#e0e0e0',
  muted: '#666666',
} as const
