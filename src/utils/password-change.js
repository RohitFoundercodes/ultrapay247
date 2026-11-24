function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

exports.normalize = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('A password change object is required');
  }
  for (const field of Object.keys(input)) {
    if (field !== 'currentPassword' && field !== 'newPassword') {
      invalid(`Field ${field} is not supported`);
    }
  }
  if (typeof input.currentPassword !== 'string' || !input.currentPassword) {
    invalid('Current password is required');
  }
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 12 ||
      Buffer.byteLength(input.newPassword, 'utf8') > 72) {
    invalid('New password must be at least 12 characters and at most 72 UTF-8 bytes');
  }
  return {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword
  };
};
