/**
 * Unipicks student feedback form: one-click builder.
 * 1. Go to https://script.google.com → New project → paste this file.
 * 2. Select createUnipicksForm and press Run. Approve the permissions (creates a form in YOUR Drive).
 * 3. Open View → Execution log for the edit link and the public link.
 * Generated from the spec in docs/user-research/google-form.md; edit there first.
 */
function createUnipicksForm() {
  var form = FormApp.create("Unipicks: Student Food Deals (2-minute survey)");
  form.setDescription("Hi! 👋 We're building Unipicks, an app that gets Kepler students deals from local food spots near campus. Order, group up with friends, and pay with MoMo. Your answers (12 quick questions, about 2 minutes) decide what we build first. Answers are anonymous unless you choose to leave your email. Murakoze! 💚");
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);
  form.setConfirmationMessage("Murakoze! Thanks for helping shape Unipicks. If you left your email for the beta, we'll be in touch soon. 🍟");

  // ----- Section: About you -----

  // Q1
  form.addMultipleChoiceItem()
    .setTitle("What year of study are you in?")
    .setChoiceValues(["Year 1", "Year 2", "Year 3", "Year 4", "Not at Kepler yet (starting soon)", "Graduated / alumni"])
    .setRequired(true);

  // Q2
  form.addMultipleChoiceItem()
    .setTitle("Which campus are you on?")
    .setChoiceValues(["Kigali (Kinyinya)"])
    .showOtherOption(true)
    .setRequired(true);

  // Q3
  form.addCheckboxItem()
    .setTitle("How do you usually pay for food and snacks?")
    .setHelpText("Select all that apply.")
    .setChoiceValues(["MTN MoMo", "Airtel Money", "Cash", "Bank card"])
    .showOtherOption(true)
    .setRequired(true);

  // ----- Section: Interest in Unipicks -----
  form.addPageBreakItem().setTitle("Interest in Unipicks").setHelpText("Unipicks shows you student-only deals from food spots near campus. You order in the app, the business confirms, you pay with mobile money and pick up with a code. You can also start a group order with friends to unlock group prices.");

  // Q4
  form.addScaleItem()
    .setTitle("How likely are you to use Unipicks?")
    .setBounds(1, 5)
    .setLabels("Not at all likely", "Very likely")
    .setRequired(true);

  // Q5
  form.addParagraphTextItem()
    .setTitle("What's the biggest problem Unipicks could solve for you?")
    .setHelpText("e.g. lunch is too expensive, I don't know the good spots, long queues, ordering for a group is messy…")
    .setRequired(false);

  // ----- Section: Feature priorities -----
  form.addPageBreakItem().setTitle("Feature priorities");

  // Q6
  form.addGridItem()
    .setTitle("Rank these features from most to least useful to you.")
    .setHelpText("Give each feature a different rank: 1st = most useful.")
    .setRows(["Student deals & discounts", "Group orders with friends", "Chat with the business", "Stories from businesses & friends", "Search (find food, places, people)"])
    .setColumns(["1st", "2nd", "3rd", "4th", "5th"])
    .setValidation(FormApp.createGridValidation()
      .setHelpText("Use each rank only once.")
      .requireLimitOneResponsePerColumn()
      .build())
    .setRequired(true);

  // Q7
  form.addCheckboxItem()
    .setTitle("What might stop you from using Unipicks?")
    .setHelpText("Select all that apply.")
    .setChoiceValues(["I don't trust paying through an app", "Discounts might be too small", "Few of the places I like would be on it", "Waiting for the business to confirm my order", "I prefer paying cash", "Mobile data cost / my phone storage", "I don't want another app"])
    .showOtherOption(true)
    .setRequired(false);

  // ----- Section: Willingness to pay & participate -----
  form.addPageBreakItem().setTitle("Willingness to pay & participate");

  // Q8
  form.addMultipleChoiceItem()
    .setTitle("For a good student lunch deal, what price feels right to you?")
    .setChoiceValues(["Under 1,000 RWF", "1,000–1,500 RWF", "1,500–2,000 RWF", "2,000–3,000 RWF", "More than 3,000 RWF if the quality is great"])
    .setRequired(true);

  // Q9
  form.addMultipleChoiceItem()
    .setTitle("Would you like to be a Unipicks beta tester?")
    .setHelpText("Beta testers try Unipicks first, help us fix problems, and get early access to deals.")
    .setChoiceValues(["Yes, sign me up!", "Maybe, tell me more", "No thanks"])
    .setRequired(true);

  // ----- Section: Open feedback & follow-up -----
  form.addPageBreakItem().setTitle("Open feedback & follow-up");

  // Q10
  form.addParagraphTextItem()
    .setTitle("If you could change one thing about buying food around campus, what would it be?")
    .setRequired(false);

  // Q11
  form.addTextItem()
    .setTitle("Your email (optional, only if you'd like us to contact you)")
    .setHelpText("Leave this blank to stay anonymous. We'll only use it to contact you about Unipicks testing and never share it.")
    .setValidation(FormApp.createTextValidation()
      .setHelpText("Please enter a valid email address, or leave it blank.")
      .requireTextIsEmail()
      .build())
    .setRequired(false);

  // Q12
  form.addCheckboxItem()
    .setTitle("What can we do with your answers?")
    .setHelpText("Optional. Select all that apply.")
    .setChoiceValues(["Contact me about the beta (using the email above)", "Invite me to a 15-minute chat about Unipicks", "Quote my answers in Unipicks posts using my first name only"])
    .setRequired(false);

  // Note: Apps Script cannot shuffle checkbox options. Turn on "Shuffle option order" for Q7 in the editor (⋮ menu).
  Logger.log('Edit link:   ' + form.getEditUrl());
  Logger.log('Public link: ' + form.getPublishedUrl());
}
