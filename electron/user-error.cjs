// An error the user caused or can fix on their own: a missing field, a file
// over the size limit, an agent CLI that is not installed. It reaches the UI
// exactly like any other error, but error reporting skips it.
function userError(message) {
  const error = new Error(message);
  error.expected = true;
  return error;
}

module.exports = { userError };
