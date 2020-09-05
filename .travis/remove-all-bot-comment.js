let github = require('octonode');

var client = github.client(process.env.GITHUB_TOKEN);

async function getBotInfo() {
  let ghme = client.me();
  const result = await ghme.infoAsync();
  return result[0];
}

var ghpr = client.issue(process.env.TRAVIS_REPO_SLUG, process.env.TRAVIS_PULL_REQUEST);

async function removeBotComments(bot) {
  let result = await ghpr.commentsAsync();
  let comments = result[0];
  for (let i = 0; i < comments.length; i++) {
    comment = comments[i];
    if (bot == comment.user.login) {
      await ghpr.deleteCommentAsync(comment.id);
    }
  }
}

async function main() {
  let botInfo = await getBotInfo();
  await removeBotComments(botInfo.login);
}

main();
