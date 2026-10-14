const mongoose = require('mongoose');

const ROLES = ['viewer', 'editor', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Имя обязательно'],
      trim: true,
      minlength: [2, 'Имя должно быть не короче 2 символов'],
      maxlength: [40, 'Имя должно быть не длиннее 40 символов'],
    },
    email: {
      type: String,
      required: [true, 'Email обязателен'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ROLES,
        message: 'Роль должна быть viewer, editor или admin',
      },
      default: 'editor',
    },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = {
  User: mongoose.model('User', userSchema),
  ROLES,
};
