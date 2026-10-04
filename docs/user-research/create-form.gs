/**
 * Unipicks student survey: one-click builder.
 * 1. Go to https://script.google.com → New project → paste this file.
 * 2. Select createUnipicksForm and press Run. Approve the permissions (creates a form in YOUR Drive).
 * 3. Open View → Execution log for the edit link and the public link.
 * Generated from the spec in docs/user-research/google-form.md; edit there first.
 *
 * Simple on purpose: one page, 7 questions, about 1 minute. 5 are one tap;
 * the 2 typing questions are optional. Kepler has one campus (Kigali).
 *
 * Design: calm, no emojis. After running, open Theme (palette icon) and set:
 * header image brand/form-header-1600x400.png, colour #95BF47, background the
 * lightest option, font style "Basic". See docs/user-research/brand/README.md.
 */
function createUnipicksForm() {
  var form = FormApp.create("Unipicks: 1-minute student survey");
  form.setDescription("Hi, I'm a Kepler student building Unipicks: student deals from food places near Kigali campus. You order ahead, pay with MoMo or Airtel Money, and pick up without waiting in line.\n\n7 quick questions, about 1 minute. Most are just one tap. No name needed. Murakoze.");
  form.setCollectEmail(false);
  form.setProgressBar(false);
  form.setAllowResponseEdits(false);
  form.setConfirmationMessage("Murakoze. Your answers help us build Unipicks for Kepler students.");

  // Q1
  form.addScaleItem()
    .setTitle("Would you use Unipicks?")
    .setBounds(1, 5)
    .setLabels("No", "Yes, a lot")
    .setRequired(true);

  // Q2
  form.addMultipleChoiceItem()
    .setTitle("Which would you use the most?")
    .setHelpText("Pick one.")
    .setChoiceValues(["Student deals and discounts", "Order ahead and skip the queue", "Group orders with friends for a better price", "Chat with the food place"])
    .setRequired(true);

  // Q3
  form.addCheckboxItem()
    .setTitle("How do you pay for food?")
    .setHelpText("Pick all that apply.")
    .setChoiceValues(["MTN MoMo", "Airtel Money", "Cash", "Bank card"])
    .setRequired(true);

  // Q4
  form.addMultipleChoiceItem()
    .setTitle("What is a good price for a student lunch?")
    .setChoiceValues(["Under 1,000 RWF", "1,000 to 1,500 RWF", "1,500 to 2,000 RWF", "2,000 to 3,000 RWF", "More than 3,000 RWF"])
    .setRequired(true);

  // Q5
  form.addCheckboxItem()
    .setTitle("What could stop you from using it?")
    .setHelpText("Optional. Pick all that apply.")
    .setChoiceValues(["I don't trust paying in an app", "My favourite places may not be on it", "The discounts may be too small", "I prefer cash"])
    .showOtherOption(true)
    .setRequired(false);

  // Q6
  form.addTextItem()
    .setTitle("What would make food around campus better for you?")
    .setHelpText("Optional. One line is enough.")
    .setRequired(false);

  // Q7
  form.addTextItem()
    .setTitle("Want to try Unipicks first? Leave your email.")
    .setHelpText("Optional. We will only use it to invite you to the beta, and never share it.")
    .setValidation(FormApp.createTextValidation()
      .setHelpText("Please enter a valid email address, or leave it blank.")
      .requireTextIsEmail()
      .build())
    .setRequired(false);

  Logger.log('Edit link:   ' + form.getEditUrl());
  Logger.log('Public link: ' + form.getPublishedUrl());
}
