import {createServer, createPubSub, PubSub, Repeater, pipe, map} from "@graphql-yoga/node";
import {WebSocketServer} from "ws";
import {useServer} from "graphql-ws/lib/use/ws";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

type Todos = Array<Todo>;

const TODOS_CHANNEL = "TODOS_CHANNEL";

const pubSub = createPubSub();

const todos = [
  {
    id: "1",
    text: "Learn GraphQL + Solid",
    done: false,
  }
]

const schema = {
  typeDefs: `
      type Todo {
        id: ID!,
        text: String!,
        done: Boolean!
      }
      type Query {
        getTodos: [Todo]
      }
      type Mutation {
        addTodo(text: String!): Todo
        setDone(id: ID!, done: Boolean!): Todo
      }
      type Subscription {
        todos: [Todo]!
      }
    `,
  resolvers: {
    Query: {
      getTodos: () => todos
    },
    Mutation: {
      addTodo: (_: unknown, {text}: { text: string }, {pubSub}: { pubSub: PubSub<any> }) => {
        const newTodo = {
          id: String(todos.length + 1),
          text,
          done: false
        }
        todos.push(newTodo)
        pubSub.publish(TODOS_CHANNEL, {todos})
        return newTodo
      },
      setDone: (_: unknown, {id, done}: { id: string, done: boolean }, {pubSub}: { pubSub: PubSub<any> }) => {
        const todo = todos.find(todo => todo.id === id)
        if (!todo) {
          throw {message: "Todo not found"}
        }
        todo.done = done
        pubSub.publish(TODOS_CHANNEL, {todos})
        return todo
      }
    },
    Subscription: {
      todos: {
        subscribe: () => pipe(
          Repeater.merge([
            todos,
            pubSub.subscribe(TODOS_CHANNEL),
          ]),
          map(() => todos),
        ),
        resolve: (payload: Todos) => payload,
      }
    }
  },
}


async function main() {
  const yogaApp = createServer({
    schema,
    context: { pubSub },
    graphiql: {
      subscriptionsProtocol: 'WS',
    },
  })

  // Get NodeJS Server from Yoga
  const httpServer = await yogaApp.start()
  // Create WebSocket server instance from our Node server
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: yogaApp.getAddressInfo().endpoint,
  })

  useServer(
    {
      execute: (args: any) => args.rootValue.execute(args),
      subscribe: (args: any) => args.rootValue.subscribe(args),
      onSubscribe: async (ctx, msg) => {
        const {schema, execute, subscribe, contextFactory, parse, validate} =
          yogaApp.getEnveloped(ctx)

        const args = {
          schema,
          operationName: msg.payload.operationName,
          document: parse(msg.payload.query),
          variableValues: msg.payload.variables,
          contextValue: await contextFactory(),
          rootValue: {
            execute,
            subscribe,
          },
        }

        const errors = validate(args.schema, args.document)
        if (errors.length) return errors
        return args
      },
    },
    wsServer,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
