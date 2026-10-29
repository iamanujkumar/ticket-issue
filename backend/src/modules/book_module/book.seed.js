import * as bookQuery from './book.query.js';

export async function seedBooks(tx, authors, authorIdByCode) {
  let bookCount = 0;

  for (const author of authors) {
    const authorId = authorIdByCode.get(author.code);

    for (const { platforms, ...book } of author.books) {
      const saved = await bookQuery.upsertBookByCode({ ...book, authorId }, tx);
      await bookQuery.replaceBookPlatforms(saved.id, platforms, tx);
      bookCount += 1;
    }
  }

  return bookCount;
}
