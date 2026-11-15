import { parse } from 'graphql';

const link = 'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@shareable"])';
const common = `
  input PageInput { number: Int = 1, size: Int = 20 }
  enum Sort { NAME_ASC NAME_DESC AREA_ASC AREA_DESC }
  type PageInfo @shareable { number: Int!, size: Int!, totalPages: Int!, hasNextPage: Boolean!, hasPreviousPage: Boolean! }
`;

export const schemas = {
  countries: parse(`${link}
    ${common}
    input CountryFilter { search: String, region: String, minArea: Float }
    type Country @key(fields: "id") {
      id: ID!, name: String!, localName: String!, region: String!, subregion: String!, capital: [String!]!, area: Float!, languages: [String!]!, currencies: [String!]!
    }
    type CountryConnection { nodes: [Country!]!, total: Int!, pageInfo: PageInfo! }
    type Source { id: ID!, name: String!, url: String!, homepage: String!, license: String!, count: Int!, skipped: Int!, importedAt: String!, checksum: String!, status: String!, error: String }
    type CatalogStats { countries: Int!, cities: Int!, universities: Int!, total: Int! }
    type Query {
      countries(filter: CountryFilter, sort: Sort = NAME_ASC, page: PageInput): CountryConnection
      country(id: ID!): Country
      sources: [Source!]
      catalogStats: CatalogStats
    }
  `),
  cities: parse(`${link}
    ${common}
    input CityFilter { search: String, countryId: ID }
    type City @key(fields: "id") { id: ID!, name: String!, subcountry: String!, country: Country! }
    type CityConnection { nodes: [City!]!, total: Int!, pageInfo: PageInfo! }
    type Country @key(fields: "id") { id: ID!, cities(search: String, sort: Sort = NAME_ASC, page: PageInput): CityConnection }
    type Query { cities(filter: CityFilter, sort: Sort = NAME_ASC, page: PageInput): CityConnection, city(id: ID!): City }
  `),
  universities: parse(`${link}
    ${common}
    input UniversityFilter { search: String, countryId: ID, favoritesOnly: Boolean }
    type Favorite { note: String!, updatedAt: String! }
    type University @key(fields: "id") { id: ID!, name: String!, state: String, domains: [String!]!, websites: [String!]!, country: Country!, favorite: Favorite }
    type UniversityConnection { nodes: [University!]!, total: Int!, pageInfo: PageInfo! }
    type Country @key(fields: "id") { id: ID!, universities(search: String, sort: Sort = NAME_ASC, page: PageInput): UniversityConnection }
    type Query { universities(filter: UniversityFilter, sort: Sort = NAME_ASC, page: PageInput): UniversityConnection, university(id: ID!): University }
    type Mutation { setFavorite(universityId: ID!, enabled: Boolean!, note: String = ""): University }
  `),
};

export function resolvers(name, catalog) {
  const entity = table => ({ __resolveReference: ref => catalog.find(table, ref.id) });
  if (name === 'countries') return {
    Query: { countries: (_, args) => catalog.list('countries', args), country: (_, { id }) => catalog.find('countries', id.toUpperCase()), sources: () => catalog.sources(), catalogStats: () => catalog.stats() },
    Country: { ...entity('countries'), capital: row => JSON.parse(row.capital) },
  };
  if (name === 'cities') return {
    Query: { cities: (_, args) => catalog.list('cities', args), city: (_, { id }) => catalog.find('cities', id) },
    City: { ...entity('cities'), country: row => ({ __typename: 'Country', id: row.countryId }) },
    Country: { __resolveReference: ref => ref, cities: (row, { search, ...args }) => catalog.list('cities', { ...args, filter: { search, countryId: row.id } }) },
  };
  return {
    Query: { universities: (_, args) => catalog.list('universities', args), university: (_, { id }) => catalog.find('universities', id) },
    Mutation: { setFavorite: (_, { universityId, enabled, note }) => catalog.setFavorite(universityId, enabled, note ?? '') },
    University: { ...entity('universities'), country: row => ({ __typename: 'Country', id: row.countryId }), favorite: row => catalog.favorite(row.id) },
    Country: { __resolveReference: ref => ref, universities: (row, { search, ...args }) => catalog.list('universities', { ...args, filter: { search, countryId: row.id } }) },
  };
}
