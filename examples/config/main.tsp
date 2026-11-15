import "@typespec/http";

using Http;

@service(#{ title: "Library API" })
@useAuth(BearerAuth)
namespace Library;

/** A book of the library. */
model Book {
  /** Identifier of the book. */
  id: string;

  /** Title, as printed on the cover. */
  title: string;

  // snake_case: `property-naming` is configured for it, and `property-type` for `*_at`.
  /** When the book was first published. */
  published_at: utcDateTime;
}

/** What went wrong, for every failed request. */
@error
model ApiError {
  /** Machine-readable reason. */
  code: string;

  /** Explanation for a person. */
  message: string;
}

// No @tag: `operation-tagged` is off in typespeclint.config.ts.
/** List the books of the library, newest first. */
@returnsDoc("The books, newest first.")
@route("/books")
@get
op listBooks(
  /** Maximum number of books to return. */
  @query page_size?: int32,
): Book[] | ApiError;
