/**
 * Unipicks student feedback form: one-click builder.
 * 1. Go to https://script.google.com → New project → paste this file.
 * 2. Select createUnipicksForm and press Run. Approve the permissions (creates a form in YOUR Drive).
 * 3. Open View → Execution log for the edit link and the public link.
 * Generated from the spec in docs/user-research/google-form.md; edit there first.
 *
 * 11 questions, about 2 minutes. Kepler College has one campus (Kigali), so
 * there is no campus question.
 *
 * Design: calm and professional, no emojis. After running, open Theme (palette
 * icon) and set: header image brand/form-header-1600x400.png, colour #95BF47
 * (Unipicks green), background the lightest option, font style "Basic".
 * See docs/user-research/brand/README.md.
 */
function createUnipicksForm() {
  var form = FormApp.create("Unipicks: help us build your student companion");
  form.setDescription(
    "Hello. I'm a Kepler student, and like you, I know the struggle: the money runs out before the month does, " +
    "lunch near campus is expensive, and you never know where the good, affordable places are.\n\n" +
    "That's why we're building Unipicks, a student companion for life around Kigali campus. " +
    "It brings together student-only deals from food places near campus, lets you order ahead and pay with MoMo or Airtel Money, " +
    "and lets you team up with friends on group orders to unlock better prices. You skip the queue and pick up with a code.\n\n" +
    "This survey has 11 short questions and takes about 2 minutes. Your answers decide what we build first. " +
    "It's anonymous unless you choose to leave your email at the end.\n\n" +
    "Murakoze, thank you."
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);
  form.setConfirmationMessage(
    "Murakoze. Thank you for helping us build something that truly works for Kepler students. " +
    "If you left your email for the beta, we'll be in touch soon."
  );

  // ----- Section 1: About you -----

  // Q1
  form.addMultipleChoiceItem()
    .setTitle("First, which year are you in?")
    .setChoiceValues(["Year 1", "Year 2", "Year 3", "Year 4", "Joining Kepler soon", "Graduated / alumni"])
    .setRequired(true);

  // Q2
  form.addCheckboxItem()
    .setTitle("How do you usually pay for food and snacks?")
    .setHelpText("Pick all that apply.")
    .setChoiceValues(["MTN MoMo", "Airtel Money", "Cash", "Bank card"])
    .showOtherOption(true)
    .setRequired(true);

  // ----- Section 2: Unipicks, your student companion -----
  form.addPageBreakItem()
    .setTitle("Unipicks, your student companion")
    .setHelpText(
      "Here's the idea. Every food place near campus can post deals that only Kepler students get. " +
      "You open the app, find a deal you like, and order it. The place confirms, you pay with mobile money, " +
      "and you get a pickup code, so no waiting in line. " +
      "Going with friends? Start a group order, everyone adds what they want, and the group gets a better price. " +
      "You can also message the food place directly and connect with friends on campus."
    );

  // Q3
  form.addScaleItem()
    .setTitle("Honestly, how likely are you to use Unipicks?")
    .setBounds(1, 5)
    .setLabels("Not likely at all", "I'd use it a lot")
    .setRequired(true);

  // Q4
  form.addParagraphTextItem()
    .setTitle("What's your biggest struggle with food around campus?")
    .setHelpText("For example: lunch costs too much, I don't know the good places, the queues are long, ordering for a group is a mess…")
    .setRequired(false);

  // ----- Section 3: What matters most to you -----
  form.addPageBreakItem().setTitle("What matters most to you");

  // Q5
  form.addGridItem()
    .setTitle("Which features would help you most? Put them in order.")
    .setHelpText("Give each feature a different rank. 1st = the one you'd use the most.")
    .setRows(["Student deals and discounts", "Group orders with friends", "Chatting with the food place", "Stories from food places and friends", "Search for food, places and friends"])
    .setColumns(["1st", "2nd", "3rd", "4th", "5th"])
    .setValidation(FormApp.createGridValidation()
      .setHelpText("Please use each rank only once.")
      .requireLimitOneResponsePerColumn()
      .build())
    .setRequired(true);

  // Q6
  form.addCheckboxItem()
    .setTitle("What could stop you from using Unipicks?")
    .setHelpText("Be honest, it helps us. Pick all that apply.")
    .setChoiceValues(["I don't trust paying through an app", "The discounts might be too small", "My favourite places might not be on it", "Waiting for the place to confirm my order", "I prefer paying cash", "Mobile data or phone storage", "I don't want another app"])
    .showOtherOption(true)
    .setRequired(false);

  // ----- Section 4: Prices and early access -----
  form.addPageBreakItem().setTitle("Prices and early access");

  // Q7
  form.addMultipleChoiceItem()
    .setTitle("For a good student lunch deal, what price feels right?")
    .setChoiceValues(["Under 1,000 RWF", "1,000–1,500 RWF", "1,500–2,000 RWF", "2,000–3,000 RWF", "More than 3,000 RWF if the food is really good"])
    .setRequired(true);

  // Q8
  form.addMultipleChoiceItem()
    .setTitle("Want to try Unipicks before everyone else?")
    .setHelpText("Beta testers use the app first, tell us what's not working, and get the first deals.")
    .setChoiceValues(["Yes, count me in", "Maybe, tell me more", "No thanks"])
    .setRequired(true);

  // ----- Section 5: Your ideas -----
  form.addPageBreakItem().setTitle("Your ideas");

  // Q9
  form.addParagraphTextItem()
    .setTitle("If you could change one thing about buying food around campus, what would it be?")
    .setRequired(false);

  // Q10
  form.addTextItem()
    .setTitle("Your email (optional)")
    .setHelpText("Only if you want us to contact you, for example about the beta. Leave it blank to stay anonymous. We'll never share it.")
    .setValidation(FormApp.createTextValidation()
      .setHelpText("Please enter a valid email address, or leave it blank.")
      .requireTextIsEmail()
      .build())
    .setRequired(false);

  // Q11
  form.addCheckboxItem()
    .setTitle("Is it okay if we…")
    .setHelpText("Optional. Pick all that apply.")
    .setChoiceValues(["Contact you about the beta (using the email above)", "Invite you to a 15-minute chat about Unipicks", "Quote your answers in Unipicks posts (first name only)"])
    .setRequired(false);

  // Note: Apps Script cannot shuffle checkbox options. Turn on "Shuffle option order" for Q6 in the editor (⋮ menu).
  Logger.log('Edit link:   ' + form.getEditUrl());
  Logger.log('Public link: ' + form.getPublishedUrl());
}
