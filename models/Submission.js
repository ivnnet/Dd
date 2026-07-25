const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  answers: [{ question: String, answer: String }],
  applicantDiscordId: { type: String, default: '' },
  applicantName: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Submission', submissionSchema);
