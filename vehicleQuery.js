const qql  = require('graphql-tag')

exports.vehicleListQuery = qql`
    query vehicleList($page: Int, $size: Int, $search: String) {
      vehicleList(
        page: $page,
        size: $size,
        search: $search,
      ) {
        id
        naming {
          make
          model
          chargetrip_version
        }
        media {
          image {
            thumbnail_url
          }
        }
      }
    }`;
