const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  type: { type: String, enum: ['text', 'textarea', 'select'], default: 'text' },
  required: { type: Boolean, default: true },
  options: [String],
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  questions: [questionSchema],
  webhookUrl: { type: String, default: '' },
  createdBy: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Application', applicationSchema);
